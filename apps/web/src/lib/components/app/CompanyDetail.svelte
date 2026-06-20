<script lang="ts">
	import type { RiskRating } from '@kyc/core';
	import { fmtDate, statusVar, type BookEntity } from '$lib/view';
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		entity,
		rating,
		onback
	}: { entity: BookEntity; rating: RiskRating | undefined; onback: () => void } = $props();

	const baseline = $derived(entity.baseline);
	const status = $derived(entity.drift.status);
	const drifted = $derived(rating && rating !== baseline.riskRating ? rating : null);
</script>

<div class="flex min-h-0 flex-col gap-3 text-[11px]">
	<Button
		variant="ghost"
		size="xs"
		class="text-muted2 hover:text-text hover:bg-panel2 -ml-1 h-auto w-fit gap-1 rounded-md px-1.5 py-1 text-[10px] font-normal tracking-widest uppercase"
		onclick={onback}
	>
		← Book
	</Button>

	<h1 class="font-display text-text text-xl leading-tight font-semibold tracking-tight">
		{baseline.name}
	</h1>

	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
		<dt class="text-muted2">Country</dt>
		<dd class="text-text2">{baseline.jurisdiction}</dd>

		<dt class="text-muted2">Domain</dt>
		<dd class="text-text2 truncate">
			{baseline.domain ? baseline.domain.replace('https://', '') : '—'}
		</dd>

		<dt class="text-muted2">Onboarded</dt>
		<dd class="text-text2 font-mono">{fmtDate(baseline.onboardedAt)}</dd>

		<dt class="text-muted2">Baseline</dt>
		<dd class="text-text2 uppercase">
			{baseline.riskRating}{#if drifted}<span class="uppercase" style="color: var(--alert)">
					→ {drifted}</span
				>{/if}
		</dd>

		{#if baseline.legalForm}
			<dt class="text-muted2">Legal form</dt>
			<dd class="text-text2">{baseline.legalForm}</dd>
		{/if}

		{#if baseline.cik}
			<dt class="text-muted2">SEC CIK</dt>
			<dd class="text-text2 font-mono">{baseline.cik}</dd>
		{/if}
	</dl>

	<div>
		<div class="text-muted2 mb-1.5 text-[10px] tracking-[0.16em] uppercase">Business model</div>
		<p class="text-text2 leading-relaxed">{baseline.businessModel}</p>
	</div>

	<!-- The selected customer's live drift verdict. -->
	<div
		class="mt-1 flex items-center justify-between rounded-lg border px-3 py-2.5"
		style="border-color: color-mix(in oklab, {statusVar[
			status
		]} 45%, var(--line)); background: color-mix(in oklab, {statusVar[status]} 6%, transparent)"
	>
		<span class="text-[10px] tracking-[0.16em] uppercase" style="color: {statusVar[status]}">
			Drift {status}
		</span>
		<span class="font-mono text-2xl leading-none tabular-nums" style="color: {statusVar[status]}">
			{entity.drift.composite.toFixed(2)}
		</span>
	</div>
</div>
