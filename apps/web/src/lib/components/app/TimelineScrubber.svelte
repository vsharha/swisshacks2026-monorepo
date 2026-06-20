<script lang="ts">
	import type { Signal } from '@kyc/core';
	import { STRUCTURAL_CONFIDENCE } from '$lib/view';

	let {
		signals,
		start,
		end,
		value = $bindable()
	}: {
		signals: Signal[];
		start: number;
		end: number;
		value: number;
	} = $props();

	// High-confidence structural events become labelled dots on the recorder.
	// Same threshold the event log uses, so the dots line up with that list.
	const events = $derived(
		signals
			.filter((s) => s.confidence >= STRUCTURAL_CONFIDENCE)
			.map((s) => ({ t: Date.parse(s.date), s }))
			.filter((e) => e.t >= start && e.t <= end)
	);

	function pct(t: number): number {
		return ((t - start) / (end - start)) * 100;
	}

	const fmt = (t: number) =>
		new Date(t).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: '2-digit' });
</script>

<div class="flex flex-col gap-1">
	<div class="flex items-baseline justify-between">
		<span class="text-muted2 text-[10px] tracking-widest uppercase">Timeline · chart recorder</span>
		<span class="text-text font-mono text-xs">{fmt(value)}</span>
	</div>

	<div class="relative h-12">
		<!-- baseline track -->
		<div class="bg-line absolute top-6 right-0 left-0 h-px"></div>

		<!-- event dots -->
		{#each events as e (e.s.id)}
			<div
				class="absolute top-6 -translate-x-1/2 -translate-y-1/2"
				style="left: {pct(e.t)}%"
				title="{fmt(e.t)} — {e.s.title}"
			>
				<div
					class="h-2 w-2 rounded-full border"
					class:opacity-100={e.t <= value}
					class:opacity-30={e.t > value}
					style="border-color: var(--watch); background: {e.t <= value
						? 'var(--watch)'
						: 'transparent'}"
				></div>
			</div>
		{/each}

		<!-- playhead -->
		<div
			class="pointer-events-none absolute top-0 bottom-0 w-px"
			style="left: {pct(value)}%; background: var(--text)"
		>
			<div
				class="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45"
				style="background: var(--text)"
			></div>
		</div>

		<input
			type="range"
			min={start}
			max={end}
			step={3_600_000}
			bind:value
			class="absolute top-5 left-0 h-3 w-full cursor-pointer appearance-none bg-transparent"
			aria-label="Scrub timeline"
		/>
	</div>

	<div class="text-muted2 flex justify-between font-mono text-[10px]">
		<span>{fmt(start)}</span>
		<span>{fmt(end)}</span>
	</div>
</div>

<style>
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 9999px;
		background: var(--text);
		border: 2px solid var(--bg);
		cursor: grab;
	}
	input[type='range']::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 9999px;
		background: var(--text);
		border: 2px solid var(--bg);
		cursor: grab;
	}
</style>
