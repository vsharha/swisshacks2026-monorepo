<script lang="ts">
	import type { RiskRating } from '@kyc/core';
	import { statusVar, type BookEntity } from '$lib/view';

	let { entity, rating }: { entity: BookEntity; rating: RiskRating | undefined } = $props();

	const drifted = $derived(rating && rating !== entity.baseline.riskRating ? rating : null);
	const status = $derived(entity.drift.status);
</script>

<div class="flex items-start justify-between gap-4">
	<div class="flex min-w-0 flex-col gap-1.5">
		<h2 class="font-display text-text truncate text-2xl leading-none font-semibold tracking-tight">
			{entity.baseline.name}
		</h2>
		<div class="text-muted2 flex items-center gap-2 text-[11px]">
			<span
				class="border-brand/30 text-brand-ink inline-flex rounded-full border px-2 py-0.5 tracking-wide uppercase"
			>
				{entity.baseline.jurisdiction}
			</span>
			<span>
				baseline <span class="text-text2 uppercase">{entity.baseline.riskRating}</span
				>{#if drifted}<span class="uppercase" style="color: var(--alert)"> → {drifted}</span>{/if}
			</span>
		</div>
	</div>

	<div
		class="shrink-0 rounded-lg border px-3.5 py-2 text-right"
		style="border-color: color-mix(in oklab, {statusVar[
			status
		]} 45%, var(--line)); background: color-mix(in oklab, {statusVar[status]} 6%, transparent)"
	>
		<div class="text-[10px] tracking-[0.16em] uppercase" style="color: {statusVar[status]}">
			Drift {status}
		</div>
		<div class="font-mono text-2xl leading-tight tabular-nums" style="color: {statusVar[status]}">
			{entity.drift.composite.toFixed(2)}
		</div>
	</div>
</div>
