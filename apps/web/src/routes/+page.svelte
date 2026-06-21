<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, preloadData } from '$app/navigation';
	import { scoreDriftVector } from '@kyc/core/drift';
	import BookList from '$lib/components/app/BookList.svelte';
	import BookGlobe from '$lib/components/app/BookGlobe.svelte';
	import EventFeedPanel from '$lib/components/app/EventFeedPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const nowIso = $derived(new Date(Date.parse(data.timeEnd)).toISOString());

	// Precache the customer pages (route code + load data) so opening one is
	// instant. The two headline demos are warmed first, then the rest of the book.
	onMount(() => {
		const priority = ['strategy', 'smartbird'];
		const ids = data.book.map((e) => e.baseline.entityId);
		const ordered = [
			...priority.filter((id) => ids.includes(id)),
			...ids.filter((id) => !priority.includes(id))
		];
		for (const id of ordered) void preloadData(`/${id}`);
	});

	// Each customer's current drift, independent of any per-customer replay.
	const book = $derived(
		data.book.map((e) => ({
			...e,
			drift: scoreDriftVector(e.baseline, e.signals, { asOf: nowIso })
		}))
	);

	const open = (id: string) => goto(`/${id}`);
</script>

<div class="grid min-h-0 flex-1 grid-cols-[240px_1fr_264px] gap-5 py-4">
	<!-- Left · customer register -->
	<aside class="border-line flex min-h-0 min-w-0 flex-col gap-3 border-r pr-4">
		<div class="flex min-h-0 flex-col gap-1 overflow-y-auto">
			<BookList {book} selectedId="" onselect={open} />
		</div>
	</aside>

	<!-- Centre · book globe -->
	<div class="min-h-0 self-stretch">
		<BookGlobe {book} onselect={open} />
	</div>

	<!-- Right · cross-book event feed -->
	<EventFeedPanel {book} asOfIso={nowIso} onselect={open} />
</div>
