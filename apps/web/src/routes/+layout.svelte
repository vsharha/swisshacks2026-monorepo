<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import TopBar from '$lib/components/app/TopBar.svelte';
	import AuditDrawer from '$lib/components/app/AuditDrawer.svelte';
	import { ui } from '$lib/ui.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	let showAudit = $state(false);

	// The role switch only does something on a customer page, so it only shows there.
	const onEntity = $derived(!!page.params.entityId);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<Tooltip.Provider delayDuration={150}>
	<div class="bg-bg text-text flex h-screen flex-col overflow-hidden px-5 py-4 font-sans text-sm">
		<TopBar
			auditCount={data.auditCount}
			role={ui.role}
			selected={onEntity}
			onRoleChange={(r) => (ui.role = r)}
			onOpenAudit={() => (showAudit = true)}
			onHome={() => goto('/')}
		/>

		{@render children()}
	</div>
</Tooltip.Provider>

<AuditDrawer bind:open={showAudit} entries={data.audit} />
<Toaster position="bottom-right" closeButton />
