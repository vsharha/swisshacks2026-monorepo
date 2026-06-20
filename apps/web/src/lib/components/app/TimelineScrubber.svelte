<script lang="ts">
	import type { Signal } from '@kyc/core';

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
	const events = $derived(
		signals
			.filter((s) => s.confidence >= 0.85)
			.map((s) => ({ t: Date.parse(s.date), s }))
			.filter((e) => e.t >= start && e.t <= end)
	);

	function pct(t: number): number {
		return ((t - start) / (end - start)) * 100;
	}

	const fmt = (t: number) =>
		new Date(t).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: '2-digit' });
</script>

<div class="flex flex-col gap-1.5">
	<div class="flex items-baseline justify-between">
		<span class="text-muted2 text-[10px] tracking-[0.16em] uppercase">Timeline · event replay</span>
		<span class="text-text font-mono text-xs tabular-nums">{fmt(value)}</span>
	</div>

	<div class="relative h-12">
		<!-- baseline track -->
		<div class="bg-line absolute top-6 right-0 left-0 h-[3px] -translate-y-1/2 rounded-full"></div>
		<!-- teal filled track up to the playhead -->
		<div
			class="bg-brand absolute top-6 left-0 h-[3px] -translate-y-1/2 rounded-full"
			style="width: {pct(value)}%"
		></div>

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
					class:opacity-40={e.t > value}
					style="border-color: var(--watch); background: {e.t <= value
						? 'var(--watch)'
						: 'var(--panel)'}"
				></div>
			</div>
		{/each}

		<!-- playhead -->
		<div
			class="pointer-events-none absolute top-2 bottom-2 w-px"
			style="left: {pct(value)}%; background: color-mix(in oklab, var(--brand) 45%, transparent)"
		></div>

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

	<div class="text-muted2 flex justify-between font-mono text-[10px] tabular-nums">
		<span>{fmt(start)}</span>
		<span>{fmt(end)}</span>
	</div>
</div>

<style>
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 9999px;
		background: var(--brand);
		border: 3px solid var(--panel);
		box-shadow: 0 1px 3px rgba(13, 41, 54, 0.25);
		cursor: grab;
	}
	input[type='range']:active::-webkit-slider-thumb {
		cursor: grabbing;
	}
	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 9999px;
		background: var(--brand);
		border: 3px solid var(--panel);
		box-shadow: 0 1px 3px rgba(13, 41, 54, 0.25);
		cursor: grab;
	}
</style>
