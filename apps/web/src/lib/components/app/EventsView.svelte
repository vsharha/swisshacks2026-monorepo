<script lang="ts">
	import {
		deriveMarketResearch,
		deriveSignalInference,
		deriveSignalInferenceShort,
		fmtDate,
		secFilingDescription,
		secFormCode,
		statusVar,
		type BookEntity
	} from '$lib/view';
	import * as Table from '$lib/components/ui/table';
	import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';

	let { entity, asOfIso }: { entity: BookEntity; asOfIso: string } = $props();

	// Past events only (nothing in the future of the timeline clock), newest first.
	const events = $derived(
		entity.signals
			.filter((s) => s.date <= asOfIso)
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date))
	);

	let scroller = $state<HTMLDivElement>();

	// When the timeline clock moves, snap the events list back to the top.
	$effect(() => {
		void asOfIso;
		if (scroller) scroller.scrollTop = 0;
	});
</script>

<div class="border-line bg-panel flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4">
	<div class="text-muted2 mb-2 text-[10px] tracking-[0.16em] uppercase">
		Events · {events.length}
	</div>
	<div
		bind:this={scroller}
		class="min-h-0 flex-1 overflow-y-auto pr-1 [&>[data-slot=table-container]]:overflow-x-visible"
	>
		<Table.Root class="text-[11px]">
			<Table.Header>
				<Table.Row class="border-line hover:bg-transparent">
					<Table.Head
						class="text-muted2 bg-panel sticky top-0 z-10 h-auto w-[34%] py-1.5 text-[10px] tracking-[0.12em] uppercase"
						>Event</Table.Head
					>
					<Table.Head
						class="text-muted2 bg-panel sticky top-0 z-10 h-auto w-[64px] py-1.5 text-[10px] tracking-[0.12em] uppercase"
						>Confidence</Table.Head
					>
					<Table.Head
						class="text-muted2 bg-panel sticky top-0 z-10 h-auto w-[30%] py-1.5 text-[10px] tracking-[0.12em] uppercase"
						>Market research</Table.Head
					>
					<Table.Head
						class="text-muted2 bg-panel sticky top-0 z-10 h-auto py-1.5 text-[10px] tracking-[0.12em] uppercase"
						>Signal inference</Table.Head
					>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each events as s (s.id)}
					{@const relevant = s.confidence >= 0.85}
					{@const filing = secFilingDescription(s)}
					{@const code = secFormCode(s)}
					{@const titleText = filing ?? s.title}
					<Table.Row class="divide-line/70 border-line align-top">
						<!-- Event -->
						<Table.Cell class="py-2 align-top whitespace-normal">
							<div class="flex items-start gap-2.5">
								<span
									class="mt-1.5 h-2 w-2 shrink-0 rounded-full border"
									style="border-color: {relevant
										? 'var(--watch)'
										: 'var(--line-2)'}; background: {relevant ? 'var(--watch)' : 'transparent'}"
									title={relevant ? 'High-relevance event' : ''}
								></span>
								<div class="flex min-w-0 flex-col gap-0.5">
									<span class="text-muted2 font-mono text-[10px]">{fmtDate(s.date)} · {s.axis}</span
									>
									<div class="flex items-start gap-1.5">
										{#if code}
											<span
												class="border-line text-muted2 mt-px shrink-0 rounded border px-1 font-mono text-[9px] tracking-wide tabular-nums"
												title="SEC form {code}">{code}</span
											>
										{/if}
										{#if s.sourceUrl}
											<a
												href={s.sourceUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="text-text2 inline-flex min-w-0 items-start gap-1 leading-snug underline decoration-dotted decoration-1 underline-offset-2 hover:decoration-solid"
											>
												<span class="min-w-0">{titleText}</span>
												<ArrowSquareOut class="text-muted2 mt-0.5 shrink-0" size={11} />
											</a>
										{:else}
											<span class="text-text2 leading-snug">{titleText}</span>
										{/if}
									</div>
									<span class="text-muted2 text-[10px]">type: {s.type.replace(/_/g, ' ')}</span>
								</div>
							</div>
						</Table.Cell>

						<!-- Confidence -->
						<Table.Cell class="py-2 align-top">
							<span
								class="font-mono text-[11px] tabular-nums"
								style="color: {statusVar[entity.drift.axes[s.axis].status]}"
								>{s.confidence.toFixed(2)}</span
							>
						</Table.Cell>

						<!-- Market research -->
						<Table.Cell class="text-muted2 py-2 align-top leading-snug whitespace-normal">
							{deriveMarketResearch(s)}
						</Table.Cell>

						<!-- Signal inference (short; full read on hover) -->
						<Table.Cell class="text-text2 py-2 align-top leading-snug whitespace-nowrap">
							<span title={deriveSignalInference(s)}>{deriveSignalInferenceShort(s)}</span>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>
