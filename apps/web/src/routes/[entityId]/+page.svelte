<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { goto, invalidateAll } from '$app/navigation';
	import { AXES, type Alert, type AuditEntry, type RiskRating } from '@kyc/core';
	import { scoreDriftVector } from '@kyc/core/drift';
	import type { SubmitFunction } from '@sveltejs/kit';
	import CompanyDetail from '$lib/components/app/CompanyDetail.svelte';
	import CostFunnel from '$lib/components/app/CostFunnel.svelte';
	import EntityView from '$lib/components/app/EntityView.svelte';
	import PatternRail from '$lib/components/app/PatternRail.svelte';
	import TimelineScrubber from '$lib/components/app/TimelineScrubber.svelte';
	import Stage3Detail from '$lib/components/app/Stage3Detail.svelte';
	import { auditActions, ui } from '$lib/ui.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const startMs = $derived(Date.parse(data.timeStart));
	const endMs = $derived(Date.parse(data.timeEnd));
	// Stable id used to restart per-customer effects (won't fire on a same-page
	// data refresh, e.g. after a governance action invalidates the load).
	const entityId = $derived(data.entity.baseline.entityId);

	// Seeded once on mount; the replay effect drives it thereafter.
	let asOf = $state(untrack(() => Date.parse(data.timeEnd)));

	// Stage 3 deep analysis — server-side LLM via the `analyze` form action.
	let analyzing = $state(false);
	let llmNote = $state<string | null>(null);
	let llmCost = $state<{
		stage2Calls: number;
		inputTokens: number;
		outputTokens: number;
		usd: number;
	} | null>(null);

	type ActionResult = { type: string; data?: Record<string, unknown> };

	const ratingLabel = (r: RiskRating) => r.charAt(0).toUpperCase() + r.slice(1);

	// Map the priority audit entries an action appended into toasts.
	function toastEvents(events: AuditEntry[]) {
		for (const e of events) {
			if (e.kind === 'escalation_decision') {
				const msg = e.escalated
					? `Escalated to Stage 3 — composite ${e.composite.toFixed(2)}`
					: `No escalation — composite ${e.composite.toFixed(2)}`;
				toast.info(msg, { description: e.reason });
			} else if (e.kind === 'outcome') {
				toast.warning(`Risk rating ${ratingLabel(e.fromRating)} → ${ratingLabel(e.toRating)}`, {
					description: 'Re-KYC outcome written to the audit log.'
				});
			} else if (e.kind === 'alert_raised') {
				toast.success('Stage 3 re-KYC alert raised', {
					description: 'Deep synthesis complete — recommendation, reasoning and citations ready.',
					duration: Number.POSITIVE_INFINITY,
					action: auditActions[e.kind]
				});
			}
		}
	}

	// `use:enhance` handler: keep the Stage 3 result in local state, then invalidate
	// so the audit count / drawer and case state refresh from the server.
	const enhanceAnalyze: SubmitFunction = () => {
		analyzing = true;
		llmNote = null;
		llmCost = null;
		return async ({ result }: { result: ActionResult }) => {
			analyzing = false;
			if (result.type !== 'success') {
				llmNote = 'Analysis failed.';
				return;
			}
			const body = result.data ?? {};
			llmCost = (body.cost as typeof llmCost) ?? null;
			ui.stage3.alert = (body.alert as Alert | null) ?? null;
			if (body.llm && body.alert)
				llmNote = 'Stage 3 synthesis complete — written to the audit log.';
			else if (!body.llm) llmNote = 'No LLM_API_KEY configured — deep synthesis skipped.';
			else llmNote = 'Composite below the alert threshold — no Stage 3 synthesis.';
			if (Array.isArray(body.events)) toastEvents(body.events as AuditEntry[]);
			await invalidateAll();
		};
	};

	// Governance action (decide/review) → audit log + updated case state + rating,
	// all refreshed from the server by invalidating the load.
	const enhanceGov: SubmitFunction = () => {
		return async ({ result }: { result: ActionResult }) => {
			if (result.type !== 'success') return;
			const body = result.data ?? {};
			if (Array.isArray(body.events)) toastEvents(body.events as AuditEntry[]);
			await invalidateAll();
		};
	};

	const asOfIso = $derived(new Date(asOf).toISOString());

	// The selected customer scored at the scrubber clock (the timeline replays it).
	const selected = $derived({
		...data.entity,
		drift: scoreDriftVector(data.entity.baseline, data.entity.signals, { asOf: asOfIso })
	});

	// Cost cascade for the selected entity at the current clock.
	const funnel = $derived.by(() => {
		const s0 = selected.signals.filter((s) => s.date <= asOfIso).length;
		const s2 = AXES.filter((a) => selected.drift.axes[a].status !== 'stable').length;
		const s3 = selected.drift.status === 'alert' ? 1 : 0;
		return { s0, s1: 5, s2, s3 };
	});

	// Reset transient Stage 3 state whenever a different customer is opened.
	$effect(() => {
		void entityId;
		llmNote = null;
		llmCost = null;
		ui.stage3.alert = null;
		ui.stage3.open = false;
	});

	// Fast-forward replay: opening a customer sweeps the timeline clock from the
	// first signal up to "now", so the radar, events and graph animate into place.
	// Keyed on entityId so a same-customer data refresh doesn't restart it.
	let rafId: number | null = null;
	$effect(() => {
		void entityId;
		const from = untrack(() => startMs);
		const to = untrack(() => endMs);
		if (!(to > from)) {
			asOf = to;
			return;
		}
		const duration = 3000;
		const ease = (t: number) => 1 - Math.pow(1 - t, 3); // cubic ease-out
		let started: number | null = null;
		const tick = (nowTs: number) => {
			started ??= nowTs;
			const t = Math.min(1, (nowTs - started) / duration);
			asOf = from + (to - from) * ease(t);
			rafId = t < 1 ? requestAnimationFrame(tick) : null;
		};
		asOf = from;
		rafId = requestAnimationFrame(tick);
		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			rafId = null;
		};
	});
</script>

<div class="grid min-h-0 flex-1 grid-cols-[240px_1fr_264px] gap-5 pt-4">
	<!-- Left · selected customer detail -->
	<aside class="border-line flex min-h-0 min-w-0 flex-col gap-3 border-r pr-4 pb-4">
		<CompanyDetail entity={selected} rating={data.rating} onback={() => goto('/')} />
		<CostFunnel {funnel} {llmCost} />
	</aside>

	<!-- Centre · drift radar, events and ownership graph -->
	<EntityView entity={selected} graph={data.graph} {asOfIso} />

	<!-- Right · pattern match + governance -->
	<PatternRail
		entity={selected}
		archetype={data.archetype}
		{asOfIso}
		role={ui.role}
		caseState={data.caseState}
		auditCount={data.auditCount}
		{llmNote}
		{analyzing}
		hasAlert={!!ui.stage3.alert}
		onViewStage3={() => (ui.stage3.open = true)}
		{enhanceGov}
		{enhanceAnalyze}
	/>
</div>

<!-- Bottom · timeline scrubber -->
<footer class="border-line border-t pt-3">
	<TimelineScrubber signals={selected.signals} start={startMs} end={endMs} bind:value={asOf} />
</footer>

<Stage3Detail bind:open={ui.stage3.open} alert={ui.stage3.alert} />
