<script lang="ts">
	import { AXES, type Alert, type PatternArchetype, type RiskRating } from '@kyc/core';
	import type { SubmitFunction } from '@sveltejs/kit';
	import DriftRadar from './DriftRadar.svelte';
	import AxisBreakdown from './AxisBreakdown.svelte';
	import EntityHeader from './EntityHeader.svelte';
	import EventsView from './EventsView.svelte';
	import EscalationPanel from './EscalationPanel.svelte';
	import type { BookEntity } from '$lib/view';

	let {
		entity,
		asOfIso,
		rating,
		archetype,
		decision,
		auditCount,
		llmAlert,
		llmNote,
		analyzing,
		enhanceDecide,
		enhanceAnalyze
	}: {
		entity: BookEntity;
		asOfIso: string;
		rating: RiskRating | undefined;
		archetype: PatternArchetype | undefined;
		decision: 'escalate' | 'dismiss' | null;
		auditCount: number;
		llmAlert: Alert | null;
		llmNote: string | null;
		analyzing: boolean;
		enhanceDecide: SubmitFunction;
		enhanceAnalyze: SubmitFunction;
	} = $props();

	const alertingAxes = $derived(AXES.filter((a) => entity.drift.axes[a].status !== 'stable'));

	// Pattern-library match (reasoning by analogy).
	const patternSim = $derived.by(() => {
		if (!archetype || alertingAxes.length === 0) return 0;
		const set = new Set(archetype.axes);
		const overlap = alertingAxes.filter((a) => set.has(a)).length;
		const union = new Set([...alertingAxes, ...archetype.axes]).size;
		return overlap / union;
	});

	// Top citations from the axes that moved.
	const citations = $derived.by(() =>
		entity.signals
			.filter((s) => s.date <= asOfIso && alertingAxes.includes(s.axis))
			.sort((a, b) => b.confidence - a.confidence || b.date.localeCompare(a.date))
			.slice(0, 4)
	);

	const recommendedAction = $derived(
		entity.drift.status === 'alert'
			? 'Re-run KYC: enhanced due diligence, refresh beneficial-ownership and business-purpose, escalate to MLRO.'
			: entity.drift.status === 'watch'
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
</script>

<main class="flex min-h-0 flex-col gap-3">
	<EntityHeader {entity} {rating} />

	<div class="grid h-[280px] shrink-0 grid-cols-[280px_1fr] gap-4">
		<div class="flex items-center justify-center">
			<DriftRadar axes={entity.drift.axes} status={entity.drift.status} />
		</div>
		<AxisBreakdown axes={entity.drift.axes} />
	</div>

	<EventsView {entity} {asOfIso} />

	<!-- Escalation flare / RE-KYC alert -->
	{#if entity.drift.status === 'alert'}
		<EscalationPanel
			entityId={entity.baseline.entityId}
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
