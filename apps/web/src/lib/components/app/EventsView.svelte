<script lang="ts">
	import { fmtDate, statusVar, type BookEntity } from '$lib/view';

	let { entity, asOfIso }: { entity: BookEntity; asOfIso: string } = $props();

	// Past events only (nothing in the future of the timeline clock), newest first.
	const events = $derived(
		entity.signals
			.filter((s) => s.date <= asOfIso)
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date))
	);

	let scroller = $state<HTMLDivElement>();

	// When the timeline clock moves, snap the events list back to the top.
	$effect(() => {
		void asOfIso;
		if (scroller) scroller.scrollTop = 0;
	});
</script>

<div class="border-line flex min-h-0 flex-1 flex-col border-t pt-2">
	<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Events ({events.length})</div>
	<div bind:this={scroller} class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
		{#each events as s (s.id)}
			{@const relevant = s.confidence >= 0.85}
			<div class="border-line/60 flex items-start gap-2 border-b pb-1 text-[11px]">
				<span
					class="mt-1.5 h-2 w-2 shrink-0 rounded-full border"
					style="border-color: var(--watch); background: {relevant
						? 'var(--watch)'
						: 'transparent'}"
					title={relevant ? 'High-relevance event' : ''}
				></span>
				<div class="flex min-w-0 flex-1 flex-col">
					<div class="flex justify-between gap-2">
						<span class="text-muted2 text-[10px]">{fmtDate(s.date)} · {s.axis}</span>
						<span class="text-[10px]" style="color: {statusVar[entity.drift.axes[s.axis].status]}"
							>{s.confidence.toFixed(2)}</span
						>
					</div>
					{#if s.source === 'eventregistry'}
						<span class="text-text">{s.title}</span>
					{/if}
					<span class="text-muted2 text-[10px]">type: {s.type.replace(/_/g, ' ')}</span>
				</div>
			</div>
		{/each}
	</div>
</div>
