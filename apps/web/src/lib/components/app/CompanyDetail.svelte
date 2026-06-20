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
	<div>
		<h1 class="font-sans text-base font-semibold tracking-tight">{baseline.name}</h1>
		<p class="text-muted2 mt-0.5 text-[11px]">
			{baseline.jurisdiction} · onboarded {fmtDate(baseline.onboardedAt)}
		</p>
		<p class="text-muted2 text-[11px]">
			baseline <span class="uppercase">{baseline.riskRating}</span>
		</p>
	</div>
	<div>
		<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Business model</div>
		<p class="text-text leading-relaxed">{baseline.businessModel}</p>
	</div>
</div>
