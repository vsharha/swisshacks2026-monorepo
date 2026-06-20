<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		bookCount,
		auditCount,
		onOpenAudit
	}: { bookCount: number; auditCount: number; onOpenAudit: () => void } = $props();
</script>

<header class="border-line flex items-center justify-between border-b pb-3">
	<div class="flex items-baseline gap-3">
		<span class="text-galaxy font-sans text-[15px] font-bold tracking-[0.22em]">AMINA</span>
		<span class="bg-line h-3.5 w-px self-center"></span>
		<span class="text-muted2 text-[11px] tracking-[0.28em] uppercase">KYC-Drift Monitor</span>
	</div>
	<div class="text-muted2 flex items-center gap-6 text-[11px]">
		<span class="flex items-center gap-1.5">
			<span class="bg-brand h-1.5 w-1.5 animate-pulse rounded-full"></span>
			<span class="tracking-widest uppercase">Live</span>
		</span>
		<span class="flex items-center gap-1.5">
			<span class="tracking-wide">Book</span>
			<span class="text-text font-mono">{bookCount}</span>
		</span>
		<Button
			variant="ghost"
			size="xs"
			class="text-muted2 hover:text-text hover:bg-panel2 h-auto gap-1.5 rounded-md px-2 py-1 text-[11px] font-normal tracking-wide"
			onclick={onOpenAudit}
			title="Open the append-only audit trail"
		>
			Audit <span class="text-text font-mono">{auditCount}</span>
		</Button>
		<span class="flex items-center gap-1.5">
			<span class="tracking-wide">Cost / day</span>
			<span class="text-text font-mono">$0.75</span>
		</span>
	</div>
</header>
