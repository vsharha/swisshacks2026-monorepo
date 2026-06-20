<script lang="ts">
	import type { Signal } from '@kyc/core';
	import { AXIS_LABEL, STRUCTURAL_CONFIDENCE, fmtDate, signalTypeLabel } from '$lib/view';

	let {
		signals,
		start,
		end,
		asOf = $bindable()
	}: {
		signals: Signal[];
		start: number;
		end: number;
		asOf: number;
	} = $props();

	// Same window the timeline scrubber spans, oldest → newest so the list reads
	// in the same direction the recorder does (left = old, right = new).
	const events = $derived(
		signals
			.map((s) => ({ t: Date.parse(s.date), s }))
			.filter((e) => e.t >= start && e.t <= end)
			.sort((a, b) => a.t - b.t)
	);
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<div class="text-muted2 mb-1 shrink-0 text-[10px] tracking-widest uppercase">
		Events · chronological
	</div>
	<div class="flex flex-1 flex-col overflow-y-auto pr-1">
		{#each events as e (e.s.id)}
			{@const main = e.s.confidence >= STRUCTURAL_CONFIDENCE}
			{@const passed = e.t <= asOf}
			<!-- Click an event to scrub the timeline to it — the playhead (and the
			     yellow dot, for main events) then lands exactly on this row's date. -->
			<button
				type="button"
				onclick={() => (asOf = e.t)}
				title="Scrub timeline to {fmtDate(e.s.date)}"
				class="border-line/60 hover:bg-line/20 flex items-start gap-2 border-b py-1 text-left transition-opacity"
				class:opacity-40={!passed}
			>
				<!-- Main events get the same yellow dot as the timeline; the rest a hollow tick. -->
				<span
					class="mt-1 h-2 w-2 shrink-0 rounded-full border"
					style="border-color: {main ? 'var(--watch)' : 'var(--line)'}; background: {main
						? 'var(--watch)'
						: 'transparent'}"
				></span>
				<span class="flex min-w-0 flex-1 flex-col gap-0.5">
					<span class="flex items-baseline justify-between gap-2">
						<span class="text-muted2 text-[10px]">{fmtDate(e.s.date)}</span>
						<span
							class="shrink-0 text-[10px]"
							style="color: {main ? 'var(--watch)' : 'var(--muted2)'}"
							>{e.s.confidence.toFixed(2)}</span
						>
					</span>
					{#if e.s.title}
						<span class="line-clamp-2 text-[11px] leading-snug">{e.s.title}</span>
					{/if}
					<span class="text-muted2 text-[10px]">
						{signalTypeLabel(e.s.type)} · {AXIS_LABEL[e.s.axis]}
					</span>
				</span>
			</button>
		{/each}
		{#if events.length === 0}
			<div class="text-muted2 text-[10px]">No events in window.</div>
		{/if}
	</div>
</div>
