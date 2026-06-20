<script lang="ts">
	let {
		bookCount,
		auditCount,
		onOpenAudit
	}: { bookCount: number; auditCount: number; onOpenAudit: () => void } = $props();
</script>

<header class="border-line flex items-center justify-between border-b pb-2">
	<div class="flex items-baseline gap-3">
		<span class="font-sans text-[13px] font-semibold tracking-[0.2em]">AMINA</span>
		<span class="text-muted2 text-[11px] tracking-[0.3em]">DRIFT MONITOR</span>
	</div>
	<div class="flex items-center gap-5 text-[11px]">
		<span class="flex items-center gap-1.5">
			<span class="h-1.5 w-1.5 animate-pulse rounded-full" style="background: var(--stable)"></span>
			<span class="text-muted2 tracking-widest">LIVE</span>
		</span>
		<span class="text-muted2">book <span class="text-text">{bookCount}</span></span>
		<button
			class="text-muted2 hover:text-text transition-colors"
			onclick={onOpenAudit}
			title="Open the append-only audit trail"
		>
			audit <span class="text-text underline-offset-2 hover:underline">{auditCount}</span>
		</button>
		<span class="text-muted2">cost/day <span class="text-stable">$0.75</span></span>
	</div>
</header>
