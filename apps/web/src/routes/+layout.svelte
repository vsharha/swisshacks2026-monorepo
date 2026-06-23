<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto, onNavigate } from '$app/navigation';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import TopBar from '$lib/components/app/TopBar.svelte';
	import AuditDrawer from '$lib/components/app/AuditDrawer.svelte';
	import { auditActions, ui } from '$lib/ui.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	let showAudit = $state(false);

	// The role switch only does something on a customer page, so it only shows there.
	const onEntity = $derived(!!page.params.entityId);

	// Animated SPA transitions via the View Transitions API (progressive
	// enhancement — browsers without it just navigate instantly, as before).
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<Tooltip.Provider delayDuration={150}>
	<div class="bg-bg text-text flex h-screen flex-col overflow-hidden px-5 pb-4 font-sans text-sm">
		<TopBar
			auditCount={data.auditCount}
			role={ui.role}
			selected={onEntity}
			onRoleChange={(r) => (ui.role = r)}
			onOpenAudit={() => (showAudit = true)}
			onHome={() => goto('/')}
		/>

		<!-- The dense, three-column layouts need real width — show the app on sm+
		     and a friendly notice on phones. -->
		<div class="hidden min-h-0 flex-1 flex-col sm:flex">
			{@render children()}
		</div>
		<div class="flex flex-1 items-center justify-center sm:hidden">
			<p class="text-muted2 max-w-[16rem] text-center text-sm leading-relaxed">
				Not optimised for mobile yet — open SENTINEL on a wider screen.
			</p>
		</div>
	</div>
</Tooltip.Provider>

<AuditDrawer bind:open={showAudit} entries={data.audit} actions={auditActions} />
<Toaster position="bottom-right" closeButton />
