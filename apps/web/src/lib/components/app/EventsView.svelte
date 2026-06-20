<script lang="ts">
	import { fmtDate, secFilingDescription, statusVar, type BookEntity } from '$lib/view';
	import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';

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

<div class="border-line bg-panel flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4">
	<div class="text-muted2 mb-2 text-[10px] tracking-[0.16em] uppercase">
		Events · {events.length}
	</div>
	<div
		bind:this={scroller}
		class="divide-line/70 flex min-h-0 flex-1 flex-col divide-y overflow-y-auto pr-1"
	>
		{#each events as s (s.id)}
			{@const relevant = s.confidence >= 0.85}
			{@const filing = secFilingDescription(s)}
			<div class="flex items-start gap-2.5 py-2 text-[11px]">
				<span
					class="mt-1.5 h-2 w-2 shrink-0 rounded-full border"
					style="border-color: {relevant ? 'var(--watch)' : 'var(--line-2)'}; background: {relevant
						? 'var(--watch)'
						: 'transparent'}"
					title={relevant ? 'High-relevance event' : ''}
				></span>
				<div class="flex min-w-0 flex-1 flex-col gap-0.5">
					<div class="flex justify-between gap-2">
						<span class="text-muted2 font-mono text-[10px]">{fmtDate(s.date)} · {s.axis}</span>
						<span
							class="shrink-0 font-mono text-[10px] tabular-nums"
							style="color: {statusVar[entity.drift.axes[s.axis].status]}"
							>{s.confidence.toFixed(2)}</span
						>
					</div>
					{#if s.sourceUrl}
						<a
							href={s.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="text-text2 group inline-flex items-start gap-1 leading-snug hover:underline"
						>
							<span class="min-w-0">{s.title}</span>
							<ArrowSquareOut
								class="text-muted2 mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
								size={11}
							/>
						</a>
					{:else}
						<span class="text-text2 leading-snug">{s.title}</span>
					{/if}
					{#if filing}
						<span class="text-muted2 leading-snug">{filing}</span>
					{/if}
					<span class="text-muted2 text-[10px]">type: {s.type.replace(/_/g, ' ')}</span>
				</div>
			</div>
		{/each}
	</div>
</div>
