<script lang="ts">
	import type { HumanRole } from '@kyc/core';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import ClipboardText from 'phosphor-svelte/lib/ClipboardText';
	import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
	import ArrowUpRight from 'phosphor-svelte/lib/ArrowUpRight';

	const REPO_URL = 'https://github.com/vsharha/swisshacks2026-monorepo';

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
	<div class="flex items-center gap-3">
		<button
			type="button"
			onclick={onHome}
			aria-label="Go to overview"
			class="flex items-center gap-3 rounded-md transition-opacity hover:opacity-70"
		>
			<span class="text-galaxy font-sans text-[15px] font-bold tracking-[0.22em]">SENTINEL</span>
			<span class="bg-line hidden h-3.5 w-px self-center sm:block"></span>
			<span class="text-muted2 hidden text-[11px] tracking-[0.28em] uppercase sm:inline"
				>KYC-Drift Monitor</span
			>
		</button>

		<Popover.Root>
			<Popover.Trigger>
				<Badge
					variant="outline"
					class="border-line text-muted2 rounded-md text-[10px] tracking-[0.18em] uppercase"
				>
					Demo
				</Badge>
			</Popover.Trigger>
			<Popover.Content side="bottom" align="start" class="max-w-[calc(100vw-2rem)] text-pretty">
				<Popover.Header>
					<Popover.Title>Demo mode</Popover.Title>
					<Popover.Description>
						Live demo of the real KYC-Drift Monitor. Monitoring, drift scoring, and the audit trail
						run exactly as in production — only the deep LLM reasoning calls are served from
						pre-computed responses to keep the demo fast and free.
					</Popover.Description>
				</Popover.Header>
			</Popover.Content>
		</Popover.Root>
	</div>

	<div class="flex items-center gap-3">
		{#if selected}
			<div
				class="border-line hidden items-center gap-0.5 rounded-md border p-0.5 sm:flex"
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
			href={REPO_URL}
			target="_blank"
			rel="noreferrer"
			size="sm"
			class="gap-1 rounded-md bg-black px-2.5 text-white hover:bg-black/85"
			title="View the source on GitHub"
			aria-label="View the source on GitHub"
		>
			<GithubLogo weight="bold" />
			<ArrowUpRight weight="bold" class="size-3" />
		</Button>

		<Button
			size="sm"
			class="hidden gap-2 rounded-md px-3 text-[11px] font-medium sm:inline-flex"
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
