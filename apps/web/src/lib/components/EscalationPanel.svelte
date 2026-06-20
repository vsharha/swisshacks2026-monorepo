<script lang="ts">
	import type { Alert, PatternArchetype } from '@kyc/core';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { fmtDate } from '$lib/view';

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
				<span
					class="border-line rounded-full border px-2 py-0.5 text-[10px]"
					style="color: var(--alert)"
					title={llmAlert.patternMatch.outcome}
				>
					matches {llmAlert.patternMatch.archetypeName} · {(
						llmAlert.patternMatch.similarity * 100
					).toFixed(0)}%
				</span>
			{:else if archetype && patternSim >= 0.3}
				<span
					class="border-line text-muted2 rounded-full border px-2 py-0.5 text-[10px]"
					title={archetype.outcome}
				>
					matches {archetype.name} · {(patternSim * 100).toFixed(0)}%
				</span>
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
				<a
					href={c.sourceUrl}
					target="_blank"
					rel="noreferrer"
					class="border-line text-muted2 hover:text-text hover:border-muted2 max-w-[260px] truncate rounded-sm border px-2 py-0.5 text-[10px] transition-colors"
					title={c.label}
				>
					{c.label}
				</a>
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
				<button
					type="submit"
					class="rounded-sm px-3 py-1 text-[11px] font-medium"
					style="background: var(--alert); color: var(--bg)">Escalate · re-KYC</button
				>
			</form>
			<form method="POST" action="?/decide" use:enhance={enhanceDecide}>
				<input type="hidden" name="entityId" value={entityId} />
				<input type="hidden" name="decision" value="dismiss" />
				<button
					type="submit"
					class="border-line text-muted2 hover:text-text rounded-sm border px-3 py-1 text-[11px]"
					>Dismiss</button
				>
			</form>
			<form method="POST" action="?/analyze" use:enhance={enhanceAnalyze}>
				<input type="hidden" name="entityId" value={entityId} />
				<input type="hidden" name="asOf" value={asOfIso} />
				<button
					type="submit"
					disabled={analyzing}
					class="border-line text-muted2 hover:text-text rounded-sm border px-3 py-1 text-[11px] disabled:opacity-50"
				>
					{analyzing ? 'Analyzing…' : 'Deep analysis · Stage 3'}
				</button>
			</form>
		{/if}
	</div>

	{#if llmNote}
		<p class="text-muted2 mt-2 text-[10px]">{llmNote}</p>
	{/if}
</div>
