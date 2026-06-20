<script lang="ts">
	import type { Alert, PatternArchetype } from '@kyc/core';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { fmtDate } from '$lib/view';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	export type DisplayCitation = { key: string; sourceUrl: string; label: string };

	let {
		entityId,
		asOfIso,
		decision,
		auditCount,
		llmAlert,
		llmNote,
		analyzing,
		archetype,
		patternSim,
		recommendedAction,
		displayCitations,
		enhanceDecide,
		enhanceAnalyze
	}: {
		entityId: string;
		asOfIso: string;
		decision: 'escalate' | 'dismiss' | null;
		auditCount: number;
		llmAlert: Alert | null;
		llmNote: string | null;
		analyzing: boolean;
		archetype: PatternArchetype | undefined;
		patternSim: number;
		recommendedAction: string;
		displayCitations: DisplayCitation[];
		enhanceDecide: SubmitFunction;
		enhanceAnalyze: SubmitFunction;
	} = $props();

	// The verdict headline (Bitter) vs the recommended action (body).
	const verdict = $derived(llmAlert ? llmAlert.reasoning : recommendedAction);
	const action = $derived(llmAlert ? llmAlert.recommendedAction : null);
</script>

<!-- The signature: the one case file that flips to galaxy-dark on escalation. -->
<section class="galaxy bg-bg text-text galaxy-card rounded-xl p-5">
	<div class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-2.5">
			<span
				class="flex items-center gap-1.5 text-[11px] tracking-[0.18em] uppercase"
				style="color: var(--alert)"
			>
				<span class="h-1.5 w-1.5 rounded-full" style="background: var(--alert)"></span>
				Re-KYC alert
			</span>
			{#if llmAlert?.patternMatch}
				{@const pm = llmAlert.patternMatch}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props }: { props: Record<string, unknown> })}
							<span class="stamp" {...props}>
								matches {pm.archetypeName} · {(pm.similarity * 100).toFixed(0)}%
							</span>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-xs">{pm.outcome}</Tooltip.Content>
				</Tooltip.Root>
			{:else if archetype && patternSim >= 0.3}
				{@const arch = archetype}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props }: { props: Record<string, unknown> })}
							<span class="stamp" {...props}>
								matches {arch.name} · {(patternSim * 100).toFixed(0)}%
							</span>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-xs">{arch.outcome}</Tooltip.Content>
				</Tooltip.Root>
			{/if}
			{#if llmAlert}
				<span class="text-muted2 font-mono text-[10px]">· {llmAlert.modelVersion}</span>
			{/if}
		</div>
		<span class="text-muted2 font-mono text-[10px]">{fmtDate(asOfIso)}</span>
	</div>

	<p class="font-display text-text mt-3 text-lg leading-snug">{verdict}</p>
	{#if action}
		<p class="text-text2 mt-2 text-[12px] leading-relaxed">
			<span class="text-muted2">Recommended.</span>
			{action}
		</p>
	{/if}

	{#if displayCitations.length}
		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each displayCitations as c (c.key)}
				<Badge
					href={c.sourceUrl}
					target="_blank"
					rel="noreferrer"
					variant="outline"
					title={c.label}
					class="text-muted2 hover:text-text border-line hover:border-line2 max-w-[280px] rounded-md text-[10px]"
				>
					<span class="truncate">{c.label}</span>
				</Badge>
			{/each}
		</div>
	{/if}

	<div class="border-line mt-4 flex items-center gap-2 border-t pt-4">
		{#if decision}
			<span class="flex items-center gap-1.5 text-[12px]">
				<span style="color: var(--brand)">✓</span>
				<span class="text-text">{decision === 'escalate' ? 'Escalated to MLRO' : 'Dismissed'}</span>
				<span class="text-muted2 font-mono">· audit #{auditCount}</span>
			</span>
		{:else}
			<form method="POST" action="?/decide" use:enhance={enhanceDecide}>
				<input type="hidden" name="entityId" value={entityId} />
				<input type="hidden" name="decision" value="escalate" />
				<Button type="submit" size="sm" class="rounded-md px-4 text-[12px] font-medium">
					Escalate · re-KYC
				</Button>
			</form>
			<form method="POST" action="?/decide" use:enhance={enhanceDecide}>
				<input type="hidden" name="entityId" value={entityId} />
				<input type="hidden" name="decision" value="dismiss" />
				<Button
					type="submit"
					variant="outline"
					size="sm"
					class="border-line2 text-text hover:bg-panel2 rounded-md bg-transparent px-4 text-[12px]"
				>
					Dismiss
				</Button>
			</form>
			<form method="POST" action="?/analyze" use:enhance={enhanceAnalyze}>
				<input type="hidden" name="entityId" value={entityId} />
				<input type="hidden" name="asOf" value={asOfIso} />
				<Button
					type="submit"
					variant="ghost"
					size="sm"
					disabled={analyzing}
					class="text-muted2 hover:text-text hover:bg-panel2 ml-auto rounded-md px-3 text-[11px]"
				>
					{analyzing ? 'Analyzing…' : 'Deep analysis · Stage 3'}
				</Button>
			</form>
		{/if}
	</div>

	{#if llmNote}
		<p class="text-muted2 mt-2 text-[10px]">{llmNote}</p>
	{/if}
</section>

<style>
	/* One decisive beat: the case file flips to galaxy. */
	.galaxy-card {
		box-shadow:
			0 1px 0 rgba(13, 41, 54, 0.04),
			6px 8px 24px rgba(13, 41, 54, 0.18);
		animation: galaxy-in 360ms cubic-bezier(0.2, 0, 0, 1) both;
	}
	@keyframes galaxy-in {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.99);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/* The "matches Long Blockchain 2017" stamp — pressed in on arrival. */
	.stamp {
		display: inline-flex;
		align-items: center;
		border: 1.5px solid color-mix(in oklab, var(--alert) 55%, transparent);
		color: var(--alert);
		border-radius: 0.375rem;
		padding: 0.05rem 0.4rem;
		font-size: 10px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		transform: rotate(-2.2deg);
		animation: stamp-in 420ms cubic-bezier(0.2, 0, 0, 1) 140ms both;
	}
	@keyframes stamp-in {
		0% {
			opacity: 0;
			transform: rotate(-2.2deg) scale(1.5);
		}
		60% {
			opacity: 1;
			transform: rotate(-2.2deg) scale(0.94);
		}
		100% {
			transform: rotate(-2.2deg) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.galaxy-card,
		.stamp {
			animation: none;
		}
	}
</style>
