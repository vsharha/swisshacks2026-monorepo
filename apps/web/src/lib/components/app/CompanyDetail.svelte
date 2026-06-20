<script lang="ts">
	import { fmtDate, type BookEntity } from '$lib/view';

	let { entity, onback }: { entity: BookEntity; onback: () => void } = $props();

	const baseline = $derived(entity.baseline);
</script>

<div class="flex min-h-0 flex-col gap-3 text-[11px]">
	<button
		class="text-muted2 hover:text-text flex items-center gap-1 text-[10px] tracking-widest uppercase transition-colors"
		onclick={onback}
	>
		← Book
	</button>

	<h1 class="font-sans text-base font-semibold tracking-tight">{baseline.name}</h1>

	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
		<dt class="text-muted2">Country</dt>
		<dd>{baseline.jurisdiction}</dd>

		<dt class="text-muted2">Domain</dt>
		<dd class="truncate">{baseline.domain ? baseline.domain.replace('https://', '') : '—'}</dd>

		<dt class="text-muted2">Onboarded</dt>
		<dd>{fmtDate(baseline.onboardedAt)}</dd>

		<dt class="text-muted2">Baseline</dt>
		<dd class="uppercase">{baseline.riskRating}</dd>

		{#if baseline.legalForm}
			<dt class="text-muted2">Legal form</dt>
			<dd>{baseline.legalForm}</dd>
		{/if}

		{#if baseline.cik}
			<dt class="text-muted2">SEC CIK</dt>
			<dd>{baseline.cik}</dd>
		{/if}
	</dl>

	<div>
		<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Business model</div>
		<p class="text-text leading-relaxed">{baseline.businessModel}</p>
	</div>
</div>
