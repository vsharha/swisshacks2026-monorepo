<script lang="ts">
	import { untrack } from 'svelte';
	import { AXES, type Alert } from '@kyc/core';
	import { scoreDriftVector } from '@kyc/core/drift';
	import type { SubmitFunction } from '@sveltejs/kit';
	import TimelineScrubber from '$lib/components/app/TimelineScrubber.svelte';
	import AuditDrawer from '$lib/components/app/AuditDrawer.svelte';
	import TopBar from '$lib/components/app/TopBar.svelte';
	import LeftRail from '$lib/components/app/LeftRail.svelte';
	import EntityView from '$lib/components/app/EntityView.svelte';
	import SignalsRail from '$lib/components/app/SignalsRail.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const startMs = $derived(Date.parse(data.timeStart));
	const endMs = $derived(Date.parse(data.timeEnd));

	// Seeded once from the initial load, then mutated locally (scrubber / form
	// actions keep results client-side); untrack marks the initial-only read.
	let asOf = $state(untrack(() => Date.parse(data.timeEnd)));
	let selectedId = $state(untrack(() => data.book[0]?.baseline.entityId ?? ''));
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
	let auditCount = $state(untrack(() => data.auditCount));
	let auditEntries = $state(untrack(() => data.audit));
	let ratings = $state(untrack(() => data.ratings));
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

	const archetype = $derived(data.patterns[0]);

	$effect(() => {
		void selectedId;
		void asOf;
		decision = null;
		llmAlert = null;
		llmNote = null;
		llmCost = null;
	});
</script>

<div class="bg-bg text-text flex h-screen flex-col overflow-hidden px-5 py-4 font-sans text-sm">
	<TopBar {auditCount} onOpenAudit={() => (showAudit = true)} />

	<!-- ── Main grid ───────────────────────────────────────────────────── -->
	<div class="grid min-h-0 flex-1 grid-cols-[240px_1fr_232px] gap-5 py-4">
		<!-- Left rail · company selection / selected company detail -->
		<LeftRail
			{book}
			{selectedId}
			{selected}
			rating={ratings[selectedId]}
			{funnel}
			{llmCost}
			onselect={(id) => (selectedId = id)}
			onclear={() => (selectedId = '')}
		/>

		<!-- Center · selected entity + right rail · signals -->
		{#if selected}
			<EntityView
				entity={selected}
				{asOfIso}
				{archetype}
				{decision}
				{auditCount}
				{llmAlert}
				{llmNote}
				{analyzing}
				{enhanceDecide}
				{enhanceAnalyze}
			/>

			<SignalsRail entity={selected} {asOfIso} />
		{/if}
	</div>

	<!-- ── Bottom · timeline scrubber ──────────────────────────────────── -->
	<footer class="border-line border-t pt-3">
		{#if selected}
			<TimelineScrubber signals={selected.signals} start={startMs} end={endMs} bind:value={asOf} />
		{/if}
	</footer>
</div>

<AuditDrawer bind:open={showAudit} entries={auditEntries} />
