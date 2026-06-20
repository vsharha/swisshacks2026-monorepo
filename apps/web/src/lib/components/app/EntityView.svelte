<script lang="ts">
	import { AXES, type Alert } from '@kyc/core';
	import DriftRadar from './DriftRadar.svelte';
	import AxisBreakdown from './AxisBreakdown.svelte';
	import EventsView from './EventsView.svelte';
	import EscalationPanel from './EscalationPanel.svelte';
	import type { BookEntity } from '$lib/view';

	let {
		entity,
		asOfIso,
		llmAlert
	}: {
		entity: BookEntity;
		asOfIso: string;
		llmAlert: Alert | null;
	} = $props();

	const alertingAxes = $derived(AXES.filter((a) => entity.drift.axes[a].status !== 'stable'));

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

<main class="flex min-h-0 min-w-0 flex-col gap-4">
	<div class="border-line bg-panel flex shrink-0 flex-col gap-3 rounded-lg border p-4">
		<div class="text-muted2 text-[10px] tracking-[0.16em] uppercase">Drift vector · 5 axes</div>
		<div class="grid h-[244px] grid-cols-[280px_1fr] gap-6">
			<div class="flex items-center justify-center">
				<DriftRadar axes={entity.drift.axes} status={entity.drift.status} />
			</div>
			<AxisBreakdown axes={entity.drift.axes} />
		</div>
	</div>

	<EventsView {entity} {asOfIso} />

	<!-- Escalation flare / RE-KYC alert verdict -->
	{#if entity.drift.status === 'alert'}
		<EscalationPanel {asOfIso} {llmAlert} {recommendedAction} {displayCitations} />
	{/if}
</main>
