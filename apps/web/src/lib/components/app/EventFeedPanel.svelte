<script lang="ts">
	import type { RiskStatus } from '@kyc/core';
	import { deriveMarketResearch, fmtDate, statusVar, FLAG, type BookEntity } from '$lib/view';
	import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';

	let {
		book,
		asOfIso,
		onselect
	}: { book: BookEntity[]; asOfIso: string; onselect: (id: string) => void } = $props();

	// Risk weight for the "risk-weighted, then recent" ordering.
	const STATUS_RANK: Record<RiskStatus, number> = { alert: 2, watch: 1, stable: 0 };

	// One flat feed of every signal across the whole book (all source types, not
	// just media), past of the clock, newest first — then by company risk and
	// confidence to break ties. Capped to keep the rail scannable.
	const items = $derived(
		book
			.flatMap((e) =>
				e.signals.filter((s) => s.date <= asOfIso).map((s) => ({ entity: e, signal: s }))
			)
			.sort((a, b) => {
				const date = b.signal.date.localeCompare(a.signal.date);
				if (date !== 0) return date;
				const rank = STATUS_RANK[b.entity.drift.status] - STATUS_RANK[a.entity.drift.status];
				if (rank !== 0) return rank;
				return b.signal.confidence - a.signal.confidence;
			})
			.slice(0, 25)
	);
</script>

<div class="border-line bg-panel flex min-h-0 min-w-0 flex-col rounded-lg border p-4">
	<div class="text-muted2 mb-2 text-[10px] tracking-[0.16em] uppercase">
		Latest events · {items.length}
	</div>

	<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
		{#each items as { entity, signal } (signal.id)}
			{@const dot = statusVar[entity.drift.status]}
			<div
				role="button"
				tabindex="0"
				onclick={() => onselect(entity.baseline.entityId)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onselect(entity.baseline.entityId);
					}
				}}
				class="border-line hover:bg-panel2 group focus-visible:ring-brand w-full cursor-pointer rounded-md border p-2.5 text-left transition-colors focus-visible:ring-1 focus-visible:outline-none"
			>
				<!-- company + date -->
				<div class="flex items-center justify-between gap-2">
					<span class="flex min-w-0 items-center gap-1.5">
						<span class="h-2 w-2 shrink-0 rounded-full" style="background: {dot}"></span>
						<span class="text-text2 truncate text-[11px] font-medium">
							{FLAG[entity.baseline.jurisdiction] ?? ''}
							{entity.baseline.name}
						</span>
					</span>
					<span class="text-muted2 shrink-0 font-mono text-[10px] tabular-nums">
						{fmtDate(signal.date)}
					</span>
				</div>

				<!-- headline -->
				<div class="text-text mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug">
					<span class="min-w-0">{signal.title}</span>
					{#if signal.sourceUrl}
						<a
							href={signal.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							onclick={(e) => e.stopPropagation()}
							class="text-muted2 hover:text-text mt-0.5 shrink-0"
							title="Open source"
						>
							<ArrowSquareOut size={11} />
						</a>
					{/if}
				</div>

				<!-- source-derived research context -->
				<div class="text-muted2 mt-1 text-[10px] leading-snug">
					{deriveMarketResearch(signal)}
				</div>
			</div>
		{:else}
			<div class="text-muted2 py-6 text-center text-[11px]">No recent events.</div>
		{/each}
	</div>
</div>
