<script lang="ts">
	import type { HumanRole } from '@kyc/core';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import ClipboardText from 'phosphor-svelte/lib/ClipboardText';

	let {
		auditCount,
		role,
		selected,
		onRoleChange,
		onOpenAudit,
		onHome
	}: {
		auditCount: number;
		role: HumanRole;
		selected: boolean;
		onRoleChange: (r: HumanRole) => void;
		onOpenAudit: () => void;
		onHome: () => void;
	} = $props();

	const roles: { id: HumanRole; label: string }[] = [
		{ id: 'analyst', label: 'Analyst' },
		{ id: 'compliance_officer', label: 'Compliance' }
	];
</script>

<header class="border-line flex h-16 shrink-0 items-center justify-between border-b">
	<button
		type="button"
		onclick={onHome}
		aria-label="Go to overview"
		class="flex items-center gap-3 rounded-md transition-opacity hover:opacity-70"
	>
		<span class="text-galaxy font-sans text-[15px] font-bold tracking-[0.22em]">SENTINEL</span>
		<span class="bg-line h-3.5 w-px self-center"></span>
		<span class="text-muted2 text-[11px] tracking-[0.28em] uppercase">KYC-Drift Monitor</span>
	</button>

	<div class="flex items-center gap-3">
		{#if selected}
			<div
				class="border-line flex items-center gap-0.5 rounded-md border p-0.5"
				role="group"
				aria-label="Active role"
			>
				{#each roles as r (r.id)}
					<button
						type="button"
						onclick={() => onRoleChange(r.id)}
						class={cn(
							'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
							role === r.id ? 'bg-panel2 text-text' : 'text-muted2 hover:text-text'
						)}
						aria-pressed={role === r.id}
					>
						{r.label}
					</button>
				{/each}
			</div>
		{/if}

		<Button
			size="sm"
			class="gap-2 rounded-md px-3 text-[11px] font-medium"
			onclick={onOpenAudit}
			title="Open the append-only audit trail"
		>
			<ClipboardText weight="bold" />
			Audit log
			<span
				class="ml-0.5 rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white"
				>{auditCount}</span
			>
		</Button>
	</div>
</header>
