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

	// Sidebar mode: the book ('list') or the selected company's detail.
	// A company is selected on load, so open straight to its detail.
	let panelView = $state<'list' | 'detail'>('detail');
</script>

<aside class="border-line flex min-h-0 min-w-0 flex-col gap-3 border-r pr-4">
	{#if panelView === 'detail' && selected}
		<CompanyDetail
			entity={selected}
			{rating}
			onback={() => {
				panelView = 'list';
				onclear();
			}}
		/>
	{:else}
		<div class="flex min-h-0 flex-col gap-1 overflow-y-auto">
			<BookList
				{book}
				{selectedId}
				onselect={(id) => {
					panelView = 'detail';
					onselect(id);
				}}
			/>
		</div>
	{/if}
	{#if selected}
		<CostFunnel {funnel} {llmCost} />
	{/if}
</aside>
