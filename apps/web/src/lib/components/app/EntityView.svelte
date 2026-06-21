<script lang="ts">
	import type { RiskGraph } from '@kyc/core';
	import DriftRadar from './DriftRadar.svelte';
	import AxisBreakdown from './AxisBreakdown.svelte';
	import EventsView from './EventsView.svelte';
	import KnowledgeGraph from './KnowledgeGraph.svelte';
	import type { BookEntity } from '$lib/view';

	let { entity, graph, asOfIso }: { entity: BookEntity; graph: RiskGraph; asOfIso: string } =
		$props();
</script>

<main class="flex min-h-0 min-w-0 flex-col gap-4">
	<div class="border-line bg-panel flex shrink-0 flex-col gap-3 rounded-lg border p-4">
		<div class="text-muted2 text-[10px] tracking-[0.16em] uppercase">Drift vector · 5 axes</div>
		<div class="grid min-h-[244px] grid-cols-[280px_1fr] items-center gap-6">
			<div class="flex items-center justify-center">
				<DriftRadar axes={entity.drift.axes} status={entity.drift.status} />
			</div>
			<AxisBreakdown axes={entity.drift.axes} />
		</div>
	</div>

	<KnowledgeGraph {entity} {graph} {asOfIso} />

	<EventsView {entity} {asOfIso} />
</main>
