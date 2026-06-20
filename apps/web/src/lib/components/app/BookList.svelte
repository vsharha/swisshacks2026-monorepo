<script lang="ts">
	import { statusVar, type BookEntity } from '$lib/view';

	let {
		book,
		selectedId,
		onselect
	}: { book: BookEntity[]; selectedId: string; onselect: (id: string) => void } = $props();
</script>

<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">
	Book ({book.length})
</div>
{#each book as e (e.baseline.entityId)}
	{@const st = e.drift.status}
	<button
		class="group hover:bg-panel flex flex-col gap-1 rounded-sm border-l-2 px-2 py-1.5 text-left transition-colors"
		style="border-color: {selectedId === e.baseline.entityId
			? statusVar[st]
			: 'transparent'}; background: {selectedId === e.baseline.entityId
			? 'var(--panel)'
			: 'transparent'}"
		onclick={() => onselect(e.baseline.entityId)}
	>
		<div class="flex items-center justify-between">
			<span class="truncate font-sans text-[12px]">{e.baseline.name}</span>
			<span class="text-[11px]" style="color: {statusVar[st]}">{e.drift.composite.toFixed(2)}</span>
		</div>
		<div class="bg-panel2 flex h-1 w-full overflow-hidden rounded-full">
			<div
				class="h-full rounded-full"
				style="width: {e.drift.composite * 100}%; background: {statusVar[
					st
				]}; transition: width 220ms cubic-bezier(0.2,0,0,1)"
			></div>
		</div>
	</button>
{/each}
