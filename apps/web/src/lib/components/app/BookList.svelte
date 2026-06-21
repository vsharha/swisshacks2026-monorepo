<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { statusVar, FLAG, HQ, type BookEntity } from '$lib/view';
	import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';

	let {
		book,
		selectedId,
		onselect
	}: { book: BookEntity[]; selectedId: string; onselect: (id: string) => void } = $props();

	let query = $state('');

	// Riskiest first, then by composite within a status.
	const RISK_RANK = { alert: 0, watch: 1, stable: 2 } as const;

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const matches = !q
			? book
			: book.filter((e) => {
					const b = e.baseline;
					const haystack = [b.name, b.jurisdiction, HQ[b.entityId]?.city, ...(b.aliases ?? [])];
					return haystack.some((s) => s?.toLowerCase().includes(q));
				});
		return [...matches].sort(
			(a, b) =>
				RISK_RANK[a.drift.status] - RISK_RANK[b.drift.status] ||
				b.drift.composite - a.drift.composite
		);
	});
</script>

<div class="text-muted2 mb-2 text-[10px] tracking-[0.18em] uppercase">Book · {filtered.length}</div>
<div class="relative mb-2">
	<MagnifyingGlass
		class="text-muted2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
	/>
	<Input type="text" bind:value={query} placeholder="Search book…" class="h-8 pl-8 text-[12.5px]" />
</div>
<div class="border-line divide-line divide-y border-y">
	{#each filtered as e (e.baseline.entityId)}
		{@const st = e.drift.status}
		{@const sel = selectedId === e.baseline.entityId}
		<button
			class="group hover:bg-panel2/60 flex w-full flex-col gap-1.5 border-l-2 px-2.5 py-2.5 text-left transition-colors"
			class:border-brand={sel}
			class:bg-panel2={sel}
			class:border-transparent={!sel}
			onclick={() => onselect(e.baseline.entityId)}
		>
			<div class="flex items-baseline justify-between gap-2">
				<span class="text-text truncate text-[12.5px]" class:font-medium={sel}
					>{e.baseline.name}</span
				>
				<span class="font-mono text-[12px] tabular-nums" style="color: {statusVar[st]}"
					>{e.drift.composite.toFixed(2)}</span
				>
			</div>
			<div class="text-muted2 flex items-center gap-1.5 text-[11px]">
				<span class="text-[12px] leading-none">{FLAG[e.baseline.jurisdiction] ?? '🏳️'}</span>
				<span class="truncate">{HQ[e.baseline.entityId]?.city ?? e.baseline.jurisdiction}</span>
			</div>
			<div
				class="bg-panel2 group-hover:bg-line/80 flex h-[3px] w-full overflow-hidden rounded-full"
			>
				<div
					class="h-full rounded-full"
					style="width: {e.drift.composite * 100}%; background: {statusVar[
						st
					]}; transition: width 220ms cubic-bezier(0.2,0,0,1)"
				></div>
			</div>
		</button>
	{:else}
		<div class="text-muted2 px-2.5 py-6 text-center text-[11px]">No matches for “{query}”</div>
	{/each}
</div>
