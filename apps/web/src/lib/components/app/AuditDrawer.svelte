<script lang="ts">
	import type { AuditEntry } from '@kyc/core';

	let { entries, onclose }: { entries: AuditEntry[]; onclose: () => void } = $props();

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

<div class="fixed inset-0 z-40 flex justify-end">
	<button
		class="absolute inset-0 cursor-default bg-black/40"
		aria-label="Close audit trail"
		onclick={onclose}
	></button>
	<aside
		class="bg-panel border-line relative flex h-full w-[420px] flex-col border-l"
		style="box-shadow: -16px 0 40px rgba(0,0,0,0.4)"
	>
		<header class="border-line flex items-center justify-between border-b px-4 py-3">
			<div class="flex items-baseline gap-2">
				<span class="font-sans text-[12px] font-semibold tracking-widest uppercase"
					>Audit trail</span
				>
				<span class="text-muted2 text-[10px]">append-only · hash-chained</span>
			</div>
			<button class="text-muted2 hover:text-text text-[11px]" onclick={onclose}>✕ close</button>
		</header>

		<div class="flex-1 overflow-y-auto px-4 py-2">
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
		</div>
	</aside>
</div>
