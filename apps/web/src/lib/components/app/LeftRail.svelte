<script lang="ts">
	import type { RiskRating } from '@kyc/core';
	import BookList from './BookList.svelte';
	import CompanyDetail from './CompanyDetail.svelte';
	import CostFunnel from './CostFunnel.svelte';
	import type { BookEntity } from '$lib/view';

	let {
		book,
		selectedId,
		selected,
		rating,
		funnel,
		llmCost,
		onselect,
		onclear
	}: {
		book: BookEntity[];
		selectedId: string;
		selected: BookEntity | undefined;
		rating: RiskRating | undefined;
		funnel: { s0: number; s1: number; s2: number; s3: number };
		llmCost: {
			stage2Calls: number;
			inputTokens: number;
			outputTokens: number;
			usd: number;
		} | null;
		onselect: (id: string) => void;
		onclear: () => void;
	} = $props();

	// Sidebar mode follows the selection: a selected company shows its detail,
	// otherwise the book list. Derived (not local state) so picking a company
	// anywhere — book list or globe — keeps the rail in sync.
</script>

<aside class="border-line flex min-h-0 min-w-0 flex-col gap-3 border-r pr-4">
	{#if selected}
		<CompanyDetail entity={selected} {rating} onback={onclear} />
	{:else}
		<div class="flex min-h-0 flex-col gap-1 overflow-y-auto">
			<BookList {book} {selectedId} {onselect} />
		</div>
	{/if}
	{#if selected}
		<CostFunnel {funnel} {llmCost} />
	{/if}
</aside>
