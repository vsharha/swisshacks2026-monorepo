<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import ClipboardText from 'phosphor-svelte/lib/ClipboardText';

	let { auditCount, onOpenAudit }: { auditCount: number; onOpenAudit: () => void } = $props();
</script>

<header class="border-line flex items-center justify-between border-b pb-3">
	<div class="flex items-baseline gap-3">
		<span class="text-galaxy font-sans text-[15px] font-bold tracking-[0.22em]">AMINA</span>
		<span class="bg-line h-3.5 w-px self-center"></span>
		<span class="text-muted2 text-[11px] tracking-[0.28em] uppercase">KYC-Drift Monitor</span>
	</div>
	<Button
		variant="outline"
		size="sm"
		class="border-line2 text-text2 hover:text-text hover:border-muted2 gap-2 rounded-md px-3 text-[11px] font-normal"
		onclick={onOpenAudit}
		title="Open the append-only audit trail"
	>
		<ClipboardText weight="bold" />
		Audit log
		<span
			class="bg-panel2 text-text ml-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
			>{auditCount}</span
		>
	</Button>
</header>
