<script lang="ts">
	import type { Alert } from '@kyc/core';
	import { fmtDate } from '$lib/view';
	import { Badge } from '$lib/components/ui/badge/index.js';

	export type DisplayCitation = { key: string; sourceUrl: string; label: string };

	let {
		asOfIso,
		llmAlert,
		recommendedAction,
		displayCitations
	}: {
		asOfIso: string;
		llmAlert: Alert | null;
		recommendedAction: string;
		displayCitations: DisplayCitation[];
	} = $props();

	// The verdict headline (Bitter) vs the recommended action (body).
	const verdict = $derived(llmAlert ? llmAlert.reasoning : recommendedAction);
	const action = $derived(llmAlert ? llmAlert.recommendedAction : null);
</script>

<!-- The signature: the one case file that flips to galaxy-dark on escalation. -->
<section class="galaxy bg-bg text-text galaxy-card rounded-xl p-5">
	<div class="flex items-center justify-between gap-3">
		<span
			class="flex items-center gap-1.5 text-[11px] tracking-[0.18em] uppercase"
			style="color: var(--alert)"
		>
			<span class="h-1.5 w-1.5 rounded-full" style="background: var(--alert)"></span>
			Re-KYC alert
		</span>
		<span class="text-muted2 font-mono text-[10px]">
			{#if llmAlert}{llmAlert.modelVersion} ·
			{/if}{fmtDate(asOfIso)}
		</span>
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
	@media (prefers-reduced-motion: reduce) {
		.galaxy-card {
			animation: none;
		}
	}
</style>
