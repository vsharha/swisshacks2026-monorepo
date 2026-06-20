<script lang="ts">
	import { statusVar, type BookEntity } from '$lib/view';

	let {
		book,
		selectedId,
		onselect
	}: { book: BookEntity[]; selectedId: string; onselect: (id: string) => void } = $props();
</script>

<div class="text-muted2 mb-2 text-[10px] tracking-[0.18em] uppercase">Book · {book.length}</div>
<div class="border-line divide-line divide-y border-y">
	{#each book as e (e.baseline.entityId)}
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
	{/each}
</div>
