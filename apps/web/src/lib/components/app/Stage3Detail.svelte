<script lang="ts">
	import type { Alert, DriftAxis } from '@kyc/core';
	import { fmtDate } from '$lib/view';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';

	let { alert = null, open = $bindable(false) }: { alert?: Alert | null; open?: boolean } =
		$props();

	// Reset the scroll position when the dialog opens. bits-ui auto-focuses a
	// focusable element on open, which scrolls the container down to it; prevent
	// that, focus the container itself without scrolling, and pin to the top.
	let content = $state<HTMLElement | null>(null);
	function resetScroll(e: Event) {
		e.preventDefault();
		content?.focus({ preventScroll: true });
		if (content) content.scrollTop = 0;
	}

	const AXIS_LABEL: Record<DriftAxis, string> = {
		business_model: 'Business model',
		ownership: 'Ownership',
		jurisdiction: 'Geography',
		scale: 'Scale',
		reputation: 'Reputation'
	};

	const pct = (n: number) => `${Math.round(n * 100)}%`;
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		bind:ref={content}
		onOpenAutoFocus={resetScroll}
		class="max-h-[85vh] max-w-xl overflow-y-auto"
	>
		{#if alert}
			<Dialog.Header>
				<div class="text-muted2 text-[10px] tracking-[0.16em] uppercase">
					Stage 3 · deep synthesis
				</div>
				<Dialog.Title>Re-KYC recommendation</Dialog.Title>
				<Dialog.Description>
					confidence {pct(alert.confidence)} · composite {alert.composite.toFixed(2)} ·
					{fmtDate(alert.createdAt)}
				</Dialog.Description>
			</Dialog.Header>

			<!-- Recommended action — the headline verdict. -->
			<div
				class="rounded-md px-3 py-2.5"
				style="background: color-mix(in oklab, var(--alert) 8%, transparent)"
			>
				<div class="text-[10px] tracking-[0.16em] uppercase" style="color: var(--alert)">
					Recommended action
				</div>
				<p class="text-text mt-1 text-[13px] leading-relaxed font-medium">
					{alert.recommendedAction}
				</p>
			</div>

			<!-- Triggering axes. -->
			<div>
				<div class="text-muted2 text-[10px] tracking-[0.16em] uppercase">Triggering axes</div>
				<div class="mt-1.5 flex flex-wrap gap-1">
					{#each alert.triggeringAxes as axis (axis)}
						<Badge variant="outline" class="rounded-md text-[10px]">{AXIS_LABEL[axis]}</Badge>
					{/each}
				</div>
			</div>

			<!-- Reasoning. -->
			<div>
				<div class="text-muted2 text-[10px] tracking-[0.16em] uppercase">Reasoning</div>
				<p class="text-text2 mt-1 text-[12px] leading-relaxed whitespace-pre-line">
					{alert.reasoning}
				</p>
			</div>

			<!-- Pattern match — the outcome prior. -->
			{#if alert.patternMatch}
				<div
					class="rounded-md px-3 py-2.5"
					style="background: color-mix(in oklab, var(--alert) 6%, transparent)"
				>
					<div class="flex items-baseline justify-between gap-2">
						<div class="text-[10px] tracking-[0.16em] uppercase" style="color: var(--alert)">
							Pattern match
						</div>
						<span class="font-mono text-[11px] tabular-nums" style="color: var(--alert)">
							{pct(alert.patternMatch.similarity)}
						</span>
					</div>
					<div class="text-text mt-1 text-[12px] font-medium">
						{alert.patternMatch.archetypeName}
					</div>
					<p class="text-text2 mt-1 text-[11px] leading-relaxed">{alert.patternMatch.outcome}</p>
				</div>
			{/if}

			<!-- Citations — every claim traces to a source. -->
			<div>
				<div class="text-muted2 text-[10px] tracking-[0.16em] uppercase">
					Citations · {alert.citations.length}
				</div>
				<ul class="mt-1.5 flex flex-col gap-1.5">
					{#each alert.citations as c (c.sourceUrl)}
						<li>
							<a
								href={c.sourceUrl}
								target="_blank"
								rel="noreferrer"
								class="text-text2 hover:text-text group flex items-start gap-1.5 text-[11px] leading-snug"
							>
								<ArrowSquareOut
									size={12}
									class="text-muted2 group-hover:text-brand mt-0.5 shrink-0"
								/>
								<span>{c.title}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
