<script lang="ts">
	import { AXES, type DriftVector } from '@kyc/core';
	import { AXIS_LABEL, statusVar } from '$lib/view';

	let { axes }: { axes: DriftVector['axes'] } = $props();
</script>

<div class="flex flex-col justify-center gap-2.5">
	{#each AXES as axis (axis)}
		{@const a = axes[axis]}
		<div class="flex flex-col gap-1">
			<div class="flex items-baseline justify-between">
				<span class="font-sans text-[12px]">{AXIS_LABEL[axis]}</span>
				<span class="text-[11px]" style="color: {statusVar[a.status]}">
					{a.score.toFixed(2)}
					<span class="text-muted2">· conf {a.confidence.toFixed(2)}</span>
				</span>
			</div>
			<div class="bg-panel2 h-1.5 w-full overflow-hidden rounded-full">
				<div
					class="h-full rounded-full"
					style="width: {a.score * 100}%; background: {statusVar[
						a.status
					]}; transition: width 220ms cubic-bezier(0.2,0,0,1)"
				></div>
			</div>
			{#if a.reasoning}
				<p class="text-muted2 truncate text-[10px]">{a.reasoning}</p>
			{/if}
		</div>
	{/each}
</div>
