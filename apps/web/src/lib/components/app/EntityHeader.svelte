<script lang="ts">
	import type { RiskRating } from '@kyc/core';
	import { fmtDate, statusVar, type BookEntity } from '$lib/view';

	let { entity, rating }: { entity: BookEntity; rating: RiskRating | undefined } = $props();

	const drifted = $derived(rating && rating !== entity.baseline.riskRating ? rating : null);
</script>

<div class="flex items-start justify-between">
	<div>
		<h1 class="font-sans text-lg font-semibold tracking-tight">{entity.baseline.name}</h1>
		<p class="text-muted2 text-[11px]">
			{entity.baseline.jurisdiction} · onboarded {fmtDate(entity.baseline.onboardedAt)} · baseline
			<span class="uppercase">{entity.baseline.riskRating}</span>{#if drifted}<span
					class="uppercase"
					style="color: var(--alert)"
				>
					→ {drifted}</span
				>{/if}
		</p>
	</div>
	<div
		class="rounded-sm border px-3 py-1.5 text-right"
		style="border-color: {statusVar[entity.drift.status]}"
	>
		<div class="text-[10px] tracking-widest" style="color: {statusVar[entity.drift.status]}">
			DRIFT {entity.drift.status.toUpperCase()}
		</div>
		<div class="text-2xl leading-none" style="color: {statusVar[entity.drift.status]}">
			{entity.drift.composite.toFixed(2)}
		</div>
	</div>
</div>
