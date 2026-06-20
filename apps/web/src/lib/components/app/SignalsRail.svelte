<script lang="ts">
	import { fmtDate, statusVar, type BookEntity } from '$lib/view';

	let { entity, asOfIso }: { entity: BookEntity; asOfIso: string } = $props();

	const seen = $derived(entity.signals.filter((s) => s.date <= asOfIso));
	const visibleSignals = $derived(seen.slice(0, 16));
</script>

<aside class="border-line flex min-h-0 min-w-0 flex-col border-l pl-4 text-[11px]">
	<div class="text-muted2 mb-1.5 text-[10px] tracking-[0.16em] uppercase">
		Signals ≤ clock · {seen.length}
	</div>
	<div class="divide-line/70 flex min-h-0 flex-1 flex-col divide-y overflow-y-auto pr-1">
		{#each visibleSignals as s (s.id)}
			<div class="flex min-w-0 flex-col gap-0.5 py-1.5">
				<div class="flex justify-between gap-2">
					<span class="text-muted2 font-mono text-[10px]">{fmtDate(s.date)} · {s.axis}</span>
					<span
						class="shrink-0 font-mono text-[10px] tabular-nums"
						style="color: {statusVar[entity.drift.axes[s.axis].status]}"
						>{s.confidence.toFixed(2)}</span
					>
				</div>
				<span class="text-text2 truncate text-[11px]">{s.title}</span>
			</div>
		{/each}
	</div>
</aside>
