<script lang="ts">
	import type { AuditEntry } from '@kyc/core';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';

	let { open = $bindable(false), entries }: { open?: boolean; entries: AuditEntry[] } = $props();

	function summary(e: AuditEntry): string {
		switch (e.kind) {
			case 'signal_ingested':
				return `signal ingested · ${e.source}`;
			case 'drift_evaluated':
				return `${e.axis ?? 'composite'} ${e.tier} → ${e.score.toFixed(2)}${e.cost ? ` · $${e.cost.usd.toFixed(4)}` : ''}`;
			case 'escalation_decision':
				return `escalation ${e.escalated ? 'FIRED' : 'held'} · ${e.reason}`;
			case 'alert_raised':
				return `alert raised · ${e.modelVersion}`;
			case 'human_action':
				return `${e.decision} · ${e.analyst} · ${e.rationale}`;
			case 'outcome':
				return `rating ${e.fromRating} → ${e.toRating}`;
		}
	}

	const kindColor: Record<AuditEntry['kind'], string> = {
		signal_ingested: 'var(--muted)',
		drift_evaluated: 'var(--muted)',
		escalation_decision: 'var(--watch)',
		alert_raised: 'var(--alert)',
		human_action: 'var(--text)',
		outcome: 'var(--alert)'
	};

	const time = (ts: string) => new Date(ts).toLocaleTimeString('en-GB');
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		class="bg-panel w-[420px] gap-0 sm:max-w-[420px]"
		style="box-shadow: -16px 0 40px rgba(0,0,0,0.4)"
	>
		<Sheet.Header class="border-line gap-2 border-b">
			<Sheet.Title class="font-sans text-[12px] font-semibold tracking-widest uppercase"
				>Audit trail</Sheet.Title
			>
			<Sheet.Description class="text-muted2 text-[10px]"
				>append-only · hash-chained</Sheet.Description
			>
		</Sheet.Header>

		<ScrollArea class="min-h-0 flex-1 px-4 py-2">
			{#if entries.length === 0}
				<p class="text-muted2 mt-4 text-[11px]">
					No entries yet. Run a deep analysis or escalate/dismiss to write to the log.
				</p>
			{:else}
				<ol class="flex flex-col">
					{#each entries as e (e.id)}
						<li class="border-line/60 flex flex-col gap-0.5 border-b py-2">
							<div class="flex items-center justify-between text-[10px]">
								<span class="tracking-widest uppercase" style="color: {kindColor[e.kind]}"
									>{e.kind.replace('_', ' ')}</span
								>
								<span class="text-muted2 font-mono">{time(e.ts)}</span>
							</div>
							<div class="text-text text-[11px] leading-snug">{summary(e)}</div>
							<div class="text-muted2 flex justify-between font-mono text-[9px]">
								<span>{e.entityId}</span>
								{#if e.hash}<span title={e.hash}>#{e.hash.slice(0, 10)}</span>{/if}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</ScrollArea>
	</Sheet.Content>
</Sheet.Root>
