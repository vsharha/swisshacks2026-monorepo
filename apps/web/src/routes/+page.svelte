<script lang="ts">
	import { AXES, type Alert } from '@kyc/core';
	import { scoreDriftVector } from '@kyc/core/drift';
	import type { SubmitFunction } from '@sveltejs/kit';
	import DriftRadar from '$lib/components/app/DriftRadar.svelte';
	import TimelineScrubber from '$lib/components/app/TimelineScrubber.svelte';
	import AuditDrawer from '$lib/components/app/AuditDrawer.svelte';
	import TopBar from '$lib/components/app/TopBar.svelte';
	import BookList from '$lib/components/app/BookList.svelte';
	import CompanyDetail from '$lib/components/app/CompanyDetail.svelte';
	import CostFunnel from '$lib/components/app/CostFunnel.svelte';
	import EntityHeader from '$lib/components/app/EntityHeader.svelte';
	import AxisBreakdown from '$lib/components/app/AxisBreakdown.svelte';
	import EscalationPanel from '$lib/components/app/EscalationPanel.svelte';
	import SignalsRail from '$lib/components/app/SignalsRail.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const startMs = Date.parse(data.timeStart);
	const endMs = Date.parse(data.timeEnd);

	let asOf = $state(endMs);
	let selectedId = $state(data.book[0]?.baseline.entityId ?? '');
	// Left sidebar mode: the book ('list') or the selected company's detail.
	// A company is selected on load, so open straight to its detail.
	let panelView = $state<'list' | 'detail'>('detail');
	let decision = $state<'escalate' | 'dismiss' | null>(null);

	// Stage 3 deep analysis — server-side LLM via the `analyze` form action.
	let analyzing = $state(false);
	let llmAlert = $state<Alert | null>(null);
	let llmNote = $state<string | null>(null);
	let llmCost = $state<{
		stage2Calls: number;
		inputTokens: number;
		outputTokens: number;
		usd: number;
	} | null>(null);
	let auditCount = $state(data.auditCount);
	let auditEntries = $state(data.audit);
	let ratings = $state(data.ratings);
	let showAudit = $state(false);

	type ActionResult = { type: string; data?: Record<string, unknown> };

	// `use:enhance` handler: keep the result in local state instead of a full
	// page reload, so the radar/scrubber context is preserved.
	const enhanceAnalyze: SubmitFunction = () => {
		analyzing = true;
		llmNote = null;
		llmAlert = null;
		llmCost = null;
		return async ({ result }: { result: ActionResult }) => {
			analyzing = false;
			if (result.type !== 'success') {
				llmNote = 'Analysis failed.';
				return;
			}
			const body = result.data ?? {};
			if (typeof body.auditCount === 'number') auditCount = body.auditCount;
			if (Array.isArray(body.audit)) auditEntries = body.audit as typeof auditEntries;
			llmCost = (body.cost as typeof llmCost) ?? null;
			if (body.llm && body.alert) llmAlert = body.alert as Alert;
			else if (!body.llm)
				llmNote = 'No ANTHROPIC_API_KEY configured — showing the rule-based recommendation.';
			else llmNote = 'Composite below the alert threshold — no Stage 3 synthesis.';
		};
	};

	// HITL decision → append-only audit log (+ rating outcome on escalate).
	const enhanceDecide: SubmitFunction = () => {
		return async ({ result }: { result: ActionResult }) => {
			if (result.type !== 'success') return;
			const body = result.data ?? {};
			if (body.decided === 'escalate' || body.decided === 'dismiss') decision = body.decided;
			if (typeof body.auditCount === 'number') auditCount = body.auditCount;
			if (Array.isArray(body.audit)) auditEntries = body.audit as typeof auditEntries;
			if (typeof body.rating === 'string')
				ratings = { ...ratings, [selectedId]: body.rating as (typeof ratings)[string] };
		};
	};

	const asOfIso = $derived(new Date(asOf).toISOString());

	const book = $derived(
		data.book.map((e) => ({
			...e,
			drift: scoreDriftVector(e.baseline, e.signals, { asOf: asOfIso })
		}))
	);
	const selected = $derived(book.find((e) => e.baseline.entityId === selectedId));

	// Cost cascade for the selected entity at the current clock.
	const funnel = $derived.by(() => {
		const sel = selected;
		if (!sel) return { s0: 0, s1: 5, s2: 0, s3: 0 };
		const s0 = sel.signals.filter((s) => s.date <= asOfIso).length;
		const s2 = AXES.filter((a) => sel.drift.axes[a].status !== 'stable').length;
		const s3 = sel.drift.status === 'alert' ? 1 : 0;
		return { s0, s1: 5, s2, s3 };
	});

	// Pattern-library match (reasoning by analogy).
	const archetype = $derived(data.patterns[0]);
	const alertingAxes = $derived(
		selected ? AXES.filter((a) => selected.drift.axes[a].status !== 'stable') : []
	);
	const patternSim = $derived.by(() => {
		if (!archetype || alertingAxes.length === 0) return 0;
		const set = new Set(archetype.axes);
		const overlap = alertingAxes.filter((a) => set.has(a)).length;
		const union = new Set([...alertingAxes, ...archetype.axes]).size;
		return overlap / union;
	});

	// Top citations from the axes that moved.
	const citations = $derived.by(() => {
		if (!selected) return [];
		return selected.signals
			.filter((s) => s.date <= asOfIso && alertingAxes.includes(s.axis))
			.sort((a, b) => b.confidence - a.confidence || b.date.localeCompare(a.date))
			.slice(0, 4);
	});

	const recommendedAction = $derived(
		selected?.drift.status === 'alert'
			? 'Re-run KYC: enhanced due diligence, refresh beneficial-ownership and business-purpose, escalate to MLRO.'
			: selected?.drift.status === 'watch'
				? 'Monitor: cheap tiers continue; no analyst action required yet.'
				: 'No action: baseline intact, absorbed by Stage 0/1 at ~$0.'
	);

	// Citations to render: the LLM's chosen ones when present, else rule-based.
	const displayCitations = $derived(
		llmAlert
			? llmAlert.citations.map((c, i) => ({
					key: c.signalId ?? `cite-${i}`,
					sourceUrl: c.sourceUrl,
					label: c.title
				}))
			: citations.map((s) => ({
					key: s.id,
					sourceUrl: s.sourceUrl,
					label: `${s.source} · ${s.title}`
				}))
	);

	$effect(() => {
		void selectedId;
		void asOf;
		decision = null;
		llmAlert = null;
		llmNote = null;
		llmCost = null;
	});
</script>

<div class="bg-bg text-text flex h-screen flex-col overflow-hidden p-3 font-mono text-sm">
	<TopBar bookCount={data.book.length} {auditCount} onOpenAudit={() => (showAudit = true)} />

	<!-- ── Main grid ───────────────────────────────────────────────────── -->
	<div class="grid min-h-0 flex-1 grid-cols-[220px_1fr_220px] gap-3 py-3">
		<!-- Left rail · company selection / selected company detail -->
		<aside class="border-line flex min-h-0 flex-col gap-1 border-r pr-3">
			{#if panelView === 'detail' && selected}
				<CompanyDetail
					entity={selected}
					onback={() => {
						panelView = 'list';
						selectedId = '';
					}}
				/>
			{:else}
				<div class="flex min-h-0 flex-col gap-1 overflow-y-auto">
					<BookList
						{book}
						{selectedId}
						onselect={(id) => {
							selectedId = id;
							panelView = 'detail';
						}}
					/>
				</div>
			{/if}
			<CostFunnel {funnel} {llmCost} />
		</aside>

		<!-- Center · selected entity -->
		{#if selected}
			<main class="flex min-h-0 flex-col gap-3">
				<EntityHeader entity={selected} rating={ratings[selectedId]} />

				<div class="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4">
					<div class="flex items-center justify-center">
						<DriftRadar axes={selected.drift.axes} status={selected.drift.status} />
					</div>
					<AxisBreakdown axes={selected.drift.axes} />
				</div>

				<!-- Escalation flare / RE-KYC alert -->
				{#if selected.drift.status === 'alert'}
					<EscalationPanel
						entityId={selected.baseline.entityId}
						{asOfIso}
						{decision}
						{auditCount}
						{llmAlert}
						{llmNote}
						{analyzing}
						{archetype}
						{patternSim}
						{recommendedAction}
						{displayCitations}
						{enhanceDecide}
						{enhanceAnalyze}
					/>
				{/if}
			</main>

			<!-- Right rail · signals -->
			<SignalsRail entity={selected} {asOfIso} />
		{/if}
	</div>

	<!-- ── Bottom · timeline scrubber ──────────────────────────────────── -->
	<footer class="border-line border-t pt-2">
		{#if selected}
			<TimelineScrubber signals={selected.signals} start={startMs} end={endMs} bind:value={asOf} />
		{/if}
	</footer>
</div>

{#if showAudit}
	<AuditDrawer entries={auditEntries} onclose={() => (showAudit = false)} />
{/if}
