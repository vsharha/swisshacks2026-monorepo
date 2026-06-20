<script lang="ts">
	import { fmtDate, statusVar, type BookEntity } from '$lib/view';

	let { entity, asOfIso }: { entity: BookEntity; asOfIso: string } = $props();

	const baseline = $derived(entity.baseline);
	const visibleSignals = $derived(entity.signals.filter((s) => s.date <= asOfIso).slice(0, 16));
</script>

<aside class="border-line flex min-h-0 flex-col gap-3 border-l pl-3 text-[11px]">
	<div>
		<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Baseline</div>
		<p class="text-muted2 leading-relaxed">{baseline.businessModel}</p>
	</div>
	<div>
		<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Identifiers</div>
		<div class="flex flex-col gap-0.5">
			{#if baseline.cik}
				<div class="flex justify-between">
					<span class="text-muted2">SEC CIK</span><span>{baseline.cik}</span>
				</div>
			{/if}
			{#if baseline.domain}
				<div class="flex justify-between">
					<span class="text-muted2">domain</span><span class="truncate"
						>{baseline.domain.replace('https://', '')}</span
					>
				</div>
			{/if}
			<div class="flex justify-between">
				<span class="text-muted2">signals</span><span>{entity.signals.length}</span>
			</div>
		</div>
	</div>
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Signals ≤ clock</div>
		<div class="flex flex-col gap-1 overflow-y-auto pr-1">
			{#each visibleSignals as s (s.id)}
				<div class="border-line/60 flex flex-col border-b pb-1">
					<div class="flex justify-between">
						<span class="text-muted2 text-[10px]">{fmtDate(s.date)} · {s.axis}</span>
						<span class="text-[10px]" style="color: {statusVar[entity.drift.axes[s.axis].status]}"
							>{s.confidence.toFixed(2)}</span
						>
					</div>
					<span class="truncate text-[11px]">{s.title}</span>
				</div>
			{/each}
		</div>
	</div>
</aside>
