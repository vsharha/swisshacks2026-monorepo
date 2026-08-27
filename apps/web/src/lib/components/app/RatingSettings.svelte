<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { DEFAULT_RATING_CONFIG, type RatingConfig, type RatingLevel } from '@kyc/core';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogDescription,
		DialogFooter
	} from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Plus from 'phosphor-svelte/lib/Plus';
	import Trash from 'phosphor-svelte/lib/Trash';
	import ArrowUp from 'phosphor-svelte/lib/ArrowUp';
	import ArrowDown from 'phosphor-svelte/lib/ArrowDown';
	import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';

	let { open = $bindable(false), config }: { open?: boolean; config: RatingConfig } = $props();

	// Working copy — seeded from the active scale each time the editor opens, so an
	// abandoned edit never leaks into the next session.
	let levels = $state<RatingLevel[]>([]);
	let saving = $state(false);

	$effect(() => {
		if (open) levels = config.levels.map((l) => ({ ...l }));
	});

	function slug(s: string): string {
		return (
			s
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '') || 'level'
		);
	}

	function move(i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= levels.length) return;
		[levels[i], levels[j]] = [levels[j], levels[i]];
	}

	function remove(i: number) {
		levels.splice(i, 1);
	}

	function add() {
		levels.push({ id: '', label: '', color: '#8a8f98' });
	}

	function resetToDefault() {
		levels = DEFAULT_RATING_CONFIG.levels.map((l) => ({ ...l }));
	}

	async function save() {
		const prepared = levels.map((l) => ({
			id: (l.id || slug(l.label)).trim(),
			label: l.label.trim(),
			color: l.color
		}));

		if (prepared.length === 0) return toast.error('Keep at least one rating level');
		if (prepared.some((l) => !l.label)) return toast.error('Every level needs a name');
		const ids = prepared.map((l) => l.id);
		if (new Set(ids).size !== ids.length) return toast.error('Level names must be distinct');

		saving = true;
		try {
			const res = await fetch('/api/ratings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ levels: prepared })
			});
			if (!res.ok) {
				const msg = await res.text();
				return toast.error(msg || 'Could not save the rating scale');
			}
			await invalidateAll();
			toast.success('Rating scale updated');
			open = false;
		} finally {
			saving = false;
		}
	}
</script>

<Dialog bind:open>
	<DialogContent class="bg-panel sm:max-w-[460px]">
		<DialogHeader>
			<DialogTitle class="font-sans text-[13px] font-semibold tracking-widest uppercase">
				KYC rating scale
			</DialogTitle>
			<DialogDescription class="text-muted2 text-[11px]">
				Define your own risk-rating levels — lowest first, highest last. The report and the
				escalation workflow use these.
			</DialogDescription>
		</DialogHeader>

		<div class="flex flex-col gap-2 py-1">
			{#each levels as level, i (i)}
				<div class="border-line/70 flex items-center gap-2 rounded-md border px-2 py-1.5">
					<input
						type="color"
						bind:value={level.color}
						aria-label="Level colour"
						class="border-line size-7 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
					/>
					<Input
						bind:value={level.label}
						placeholder="Level name"
						class="h-8 border-none bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-0"
					/>
					<span class="text-muted2 shrink-0 font-mono text-[9px] tracking-wider uppercase">
						{i === 0 ? 'lowest' : i === levels.length - 1 ? 'highest' : ''}
					</span>
					<div class="ml-auto flex items-center gap-0.5">
						<Button
							variant="ghost"
							size="icon"
							class="text-muted2 hover:text-text size-7"
							disabled={i === 0}
							onclick={() => move(i, -1)}
							title="Move up (lower risk)"
						>
							<ArrowUp class="size-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="text-muted2 hover:text-text size-7"
							disabled={i === levels.length - 1}
							onclick={() => move(i, 1)}
							title="Move down (higher risk)"
						>
							<ArrowDown class="size-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="text-muted2 size-7 hover:text-[var(--alert)]"
							disabled={levels.length <= 1}
							onclick={() => remove(i)}
							title="Remove level"
						>
							<Trash class="size-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		</div>

		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" class="gap-1.5 text-[12px]" onclick={add}>
				<Plus class="size-3.5" /> Add level
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="text-muted2 hover:text-text gap-1.5 text-[12px]"
				onclick={resetToDefault}
			>
				<ArrowCounterClockwise class="size-3.5" /> Reset to default
			</Button>
		</div>

		<DialogFooter>
			<Button variant="ghost" size="sm" onclick={() => (open = false)}>Cancel</Button>
			<Button size="sm" disabled={saving} onclick={save}>Save scale</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
