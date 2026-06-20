<script lang="ts">
	export type Funnel = { s0: number; s1: number; s2: number; s3: number };
	export type LlmCost = {
		stage2Calls: number;
		inputTokens: number;
		outputTokens: number;
		usd: number;
	};

	import { Separator } from '$lib/components/ui/separator/index.js';

	let { funnel, llmCost }: { funnel: Funnel; llmCost: LlmCost | null } = $props();

	const rows = $derived([
		{ k: 'S0 rules', v: funnel.s0, c: 'var(--muted)' },
		{ k: 'S1 drift', v: funnel.s1, c: 'var(--muted)' },
		{ k: 'S2 axis-LLM', v: llmCost ? llmCost.stage2Calls : funnel.s2, c: 'var(--watch)' },
		{ k: 'S3 synth', v: funnel.s3, c: 'var(--alert)' }
	]);
</script>

<div class="mt-auto flex flex-col pt-2">
	<Separator class="bg-line mb-2" />
	<div class="text-muted2 mb-2 text-[10px] tracking-widest uppercase">Cost funnel</div>
	<div class="flex flex-col gap-1.5 text-[11px]">
		{#each rows as row (row.k)}
			<div class="flex items-center justify-between">
				<span class="text-muted2">{row.k}</span>
				<span style="color: {row.c}">{row.v}</span>
			</div>
		{/each}
	</div>
	{#if llmCost}
		<Separator class="bg-line my-2" />
		<div class="flex flex-col gap-1 text-[11px]">
			<div class="flex items-center justify-between">
				<span class="text-muted2">tokens</span>
				<span class="text-text"
					>{(llmCost.inputTokens + llmCost.outputTokens).toLocaleString()}</span
				>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-muted2">$ this run</span>
				<span class="text-stable">${llmCost.usd.toFixed(4)}</span>
			</div>
		</div>
	{/if}
	<div class="text-muted2 mt-2 text-[10px] leading-relaxed">
		vs naïve LLM-on-everything<br /><span class="text-stable">~99% cheaper</span>
	</div>
</div>
