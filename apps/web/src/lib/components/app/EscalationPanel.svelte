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
</script>

<div
	class="rounded-sm border p-3"
	style="border-color: var(--alert); background: color-mix(in oklab, var(--alert) 7%, transparent)"
>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="text-[11px] tracking-widest" style="color: var(--alert)">⚠ RE-KYC ALERT</span>
			{#if llmAlert?.patternMatch}
				{@const pm = llmAlert.patternMatch}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props }: { props: Record<string, unknown> })}
							<Badge
								variant="outline"
								class="text-alert border-alert/40 rounded-full text-[10px]"
								{...props}
							>
								matches {pm.archetypeName} · {(pm.similarity * 100).toFixed(0)}%
							</Badge>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-xs">{pm.outcome}</Tooltip.Content>
				</Tooltip.Root>
			{:else if archetype && patternSim >= 0.3}
				{@const arch = archetype}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props }: { props: Record<string, unknown> })}
							<Badge variant="outline" class="text-muted2 rounded-full text-[10px]" {...props}>
								matches {arch.name} · {(patternSim * 100).toFixed(0)}%
							</Badge>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-xs">{arch.outcome}</Tooltip.Content>
				</Tooltip.Root>
			{/if}
			{#if llmAlert}
				<span class="text-muted2 text-[10px]">· {llmAlert.modelVersion}</span>
			{/if}
		</div>
		<span class="text-muted2 text-[10px]">{fmtDate(asOfIso)}</span>
	</div>

	{#if llmAlert}
		<p class="text-text mt-2 text-[12px] leading-relaxed">{llmAlert.reasoning}</p>
		<p class="text-text mt-1 text-[12px] leading-relaxed">
			<span class="text-muted2">Recommended:</span>
			{llmAlert.recommendedAction}
		</p>
	{:else}
		<p class="text-text mt-2 text-[12px] leading-relaxed">{recommendedAction}</p>
	{/if}

	{#if displayCitations.length}
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#each displayCitations as c (c.key)}
				<Badge
					href={c.sourceUrl}
					target="_blank"
					rel="noreferrer"
					variant="outline"
					title={c.label}
					class="text-muted2 hover:text-text hover:border-muted2 max-w-[260px] rounded-sm text-[10px]"
				>
					<span class="truncate">{c.label}</span>
				</Badge>
			{/each}
		</div>
	{/if}

	<div class="mt-3 flex items-center gap-2">
		{#if decision}
			<span class="text-[11px]" style="color: var(--stable)">
				✓ {decision === 'escalate' ? 'Escalated to MLRO' : 'Dismissed'} · written to audit log (#{auditCount})
			</span>
		{:else}
			<form method="POST" action="?/decide" use:enhance={enhanceDecide}>
				<input type="hidden" name="entityId" value={entityId} />
				<input type="hidden" name="decision" value="escalate" />
				<Button type="submit" size="sm" class="bg-alert text-bg hover:bg-alert/90 px-3 text-[11px]"
					>Escalate · re-KYC</Button
				>
			</form>
			<form method="POST" action="?/decide" use:enhance={enhanceDecide}>
				<input type="hidden" name="entityId" value={entityId} />
				<input type="hidden" name="decision" value="dismiss" />
				<Button type="submit" variant="outline" size="sm" class="text-muted2 px-3 text-[11px]"
					>Dismiss</Button
				>
			</form>
			<form method="POST" action="?/analyze" use:enhance={enhanceAnalyze}>
				<input type="hidden" name="entityId" value={entityId} />
				<input type="hidden" name="asOf" value={asOfIso} />
				<Button
					type="submit"
					variant="outline"
					size="sm"
					disabled={analyzing}
					class="text-muted2 px-3 text-[11px]"
				>
					{analyzing ? 'Analyzing…' : 'Deep analysis · Stage 3'}
				</Button>
			</form>
		{/if}
	</div>

	{#if llmNote}
		<p class="text-muted2 mt-2 text-[10px]">{llmNote}</p>
	{/if}
</div>
