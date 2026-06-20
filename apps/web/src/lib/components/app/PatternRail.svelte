<script lang="ts">
	import { AXES, type DriftAxis, type PatternArchetype } from '@kyc/core';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { fmtDate, type BookEntity } from '$lib/view';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';

	let {
		entity,
		archetype,
		asOfIso,
		decision,
		auditCount,
		llmNote,
		analyzing,
		enhanceDecide,
		enhanceAnalyze
	}: {
		entity: BookEntity;
		archetype: PatternArchetype | undefined;
		asOfIso: string;
		decision: 'escalate' | 'dismiss' | null;
		auditCount: number;
		llmNote: string | null;
		analyzing: boolean;
		enhanceDecide: SubmitFunction;
		enhanceAnalyze: SubmitFunction;
	} = $props();

	const SHORT: Record<DriftAxis, string> = {
		business_model: 'Business',
		ownership: 'Ownership',
		jurisdiction: 'Geography',
		scale: 'Scale',
		reputation: 'Reputation'
	};

	const entityId = $derived(entity.baseline.entityId);
	const isAlert = $derived(entity.drift.status === 'alert');
	const alertingAxes = $derived(AXES.filter((a) => entity.drift.axes[a].status !== 'stable'));

	// Reasoning by analogy — overlap of the live drift signature with the archetype.
	const sim = $derived.by(() => {
		if (!archetype || alertingAxes.length === 0) return 0;
		const set = new Set(archetype.axes);
		const overlap = alertingAxes.filter((a) => set.has(a)).length;
		const union = new Set([...alertingAxes, ...archetype.axes]).size;
		return overlap / union;
	});
	const sharedAxes = $derived(
		archetype ? alertingAxes.filter((a) => archetype.axes.includes(a)) : []
	);
	const hasMatch = $derived(!!archetype && sim >= 0.3);
</script>

<aside class="border-line flex min-h-0 min-w-0 flex-col gap-3 border-l pl-4">
	<div class="min-h-0 flex-1 overflow-y-auto pr-1">
		{#if hasMatch && archetype}
			<div class="flex items-center justify-between">
				<span class="text-[10px] tracking-[0.16em] uppercase" style="color: var(--alert)"
					>Pattern match</span
				>
				<span class="font-mono text-[11px] tabular-nums" style="color: var(--alert)"
					>{(sim * 100).toFixed(0)}%</span
				>
			</div>

			<h3 class="font-display text-text mt-2 text-base leading-tight">{archetype.name}</h3>
			<div class="text-muted2 mt-0.5 font-mono text-[10px]">{archetype.period}</div>
			<p class="text-text2 mt-2 text-[11px] leading-relaxed">{archetype.summary}</p>

			<div class="mt-3 text-[10px] tracking-[0.16em] text-muted2 uppercase">Shared axes</div>
			<div class="mt-1.5 flex flex-wrap gap-1">
				{#each sharedAxes as a (a)}
					<span
						class="rounded-full border px-2 py-0.5 text-[10px]"
						style="border-color: color-mix(in oklab, var(--alert) 35%, transparent); color: var(--alert)"
						>{SHORT[a]}</span
					>
				{/each}
			</div>

			<div
				class="mt-3 rounded-md px-2.5 py-2"
				style="background: color-mix(in oklab, var(--alert) 7%, transparent)"
			>
				<div class="text-[10px] tracking-[0.16em] uppercase" style="color: var(--alert)">
					Outcome prior
				</div>
				<p class="text-text2 mt-1 text-[11px] leading-relaxed">{archetype.outcome}</p>
			</div>

			<div class="mt-3 text-[10px] tracking-[0.16em] text-muted2 uppercase">Arc</div>
			<ol class="border-line mt-1.5 flex flex-col gap-1.5 border-l pl-3">
				{#each archetype.arc as beat (beat.date + beat.label)}
					<li class="relative">
						<span class="bg-line absolute top-1.5 -left-[14px] h-1.5 w-1.5 rounded-full"></span>
						<div class="text-muted2 font-mono text-[9px]">{fmtDate(beat.date)}</div>
						<div class="text-text2 text-[11px] leading-snug">{beat.label}</div>
					</li>
				{/each}
			</ol>

			{#if archetype.citations.length}
				<div class="mt-3 flex flex-wrap gap-1.5">
					{#each archetype.citations as c (c.sourceUrl)}
						<Badge
							href={c.sourceUrl}
							target="_blank"
							rel="noreferrer"
							variant="outline"
							title={c.title}
							class="text-muted2 hover:text-text hover:border-muted2 max-w-full rounded-md text-[10px]"
						>
							<span class="truncate">{c.title}</span>
						</Badge>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="text-muted2 mb-2 text-[10px] tracking-[0.16em] uppercase">Pattern library</div>
			<p class="text-muted2 text-[11px] leading-relaxed">
				No archetype match — baseline intact. The drift signature is compared against known
				archetypes only once a customer starts to move.
			</p>
		{/if}
	</div>

	<!-- The human-in-the-loop gate — shown only when the composite has crossed. -->
	{#if isAlert}
		<div class="border-line shrink-0 border-t pt-3">
			<div class="text-muted2 mb-2 text-[10px] tracking-[0.16em] uppercase">Re-KYC action</div>
			{#if decision}
				<div class="flex items-center gap-1.5 text-[11px]">
					<span style="color: var(--brand)">✓</span>
					<span class="text-text"
						>{decision === 'escalate' ? 'Escalated to MLRO' : 'Dismissed'}</span
					>
					<span class="text-muted2 font-mono">· audit #{auditCount}</span>
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					<!-- Investigate first: Stage 3 is the tool you use to make the call. -->
					<form method="POST" action="?/analyze" use:enhance={enhanceAnalyze}>
						<input type="hidden" name="entityId" value={entityId} />
						<input type="hidden" name="asOf" value={asOfIso} />
						<Button
							type="submit"
							size="sm"
							disabled={analyzing}
							class="w-full rounded-md text-[12px] font-medium"
						>
							<MagnifyingGlass size={13} weight="bold" class="mr-1.5" />
							{analyzing ? 'Analyzing…' : 'Deep analysis · Stage 3'}
						</Button>
					</form>

					<!-- The decision lives below the tool you use to make it. -->
					<div
						class="text-muted2 my-0.5 flex items-center gap-2 text-[10px] tracking-[0.14em] uppercase"
					>
						<span class="bg-line h-px flex-1"></span>
						decide
						<span class="bg-line h-px flex-1"></span>
					</div>
					<div class="flex gap-2">
						<form method="POST" action="?/decide" use:enhance={enhanceDecide} class="flex-1">
							<input type="hidden" name="entityId" value={entityId} />
							<input type="hidden" name="decision" value="escalate" />
							<Button
								type="submit"
								variant="destructive"
								size="sm"
								class="w-full rounded-md text-[12px] font-medium"
							>
								Escalate
							</Button>
						</form>
						<form method="POST" action="?/decide" use:enhance={enhanceDecide} class="flex-1">
							<input type="hidden" name="entityId" value={entityId} />
							<input type="hidden" name="decision" value="dismiss" />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								class="w-full rounded-md text-[12px]"
							>
								Dismiss
							</Button>
						</form>
					</div>
				</div>
			{/if}
			{#if llmNote}
				<p class="text-muted2 mt-2 text-[10px] leading-relaxed">{llmNote}</p>
			{/if}
		</div>
	{/if}
</aside>
