<script lang="ts">
	import { fmtDate, type BookEntity } from '$lib/view';
	import { Button } from '$lib/components/ui/button/index.js';

	let { entity, onback }: { entity: BookEntity; onback: () => void } = $props();

	const baseline = $derived(entity.baseline);
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
		<dd class="text-text2 uppercase">{baseline.riskRating}</dd>

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
</div>
