<script lang="ts">
	import { goto } from '$app/navigation';
	import { scoreDriftVector } from '@kyc/core/drift';
	import BookList from '$lib/components/app/BookList.svelte';
	import BookGlobe from '$lib/components/app/BookGlobe.svelte';
	import EventFeedPanel from '$lib/components/app/EventFeedPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const nowIso = $derived(new Date(Date.parse(data.timeEnd)).toISOString());

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
