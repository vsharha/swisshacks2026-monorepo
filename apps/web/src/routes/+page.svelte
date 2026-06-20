<script lang="ts">
	import { AXES, type Alert, type DriftAxis, type RiskStatus } from '@kyc/core';
	import { scoreDriftVector } from '@kyc/core/drift';
	import { enhance } from '$app/forms';
	import DriftRadar from '$lib/components/DriftRadar.svelte';
	import TimelineScrubber from '$lib/components/TimelineScrubber.svelte';
	import AuditDrawer from '$lib/components/AuditDrawer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const startMs = Date.parse(data.timeStart);
	const endMs = Date.parse(data.timeEnd);

	let asOf = $state(endMs);
	let selectedId = $state(data.book[0]?.baseline.entityId ?? '');
	let decision = $state<'escalate' | 'dismiss' | null>(null);

	// Stage 3 deep analysis — server-side LLM via the `analyze` form action.
	let analyzing = $state(false);
	let llmAlert = $state<Alert | null>(null);
	let llmNote = $state<string | null>(null);
	let llmCost = $state<{
		stage2Calls: number;
		inputTokens: number;
		outputTokens: number;
		usd: number;
	} | null>(null);
	let auditCount = $state(data.auditCount);
	let auditEntries = $state(data.audit);
	let ratings = $state(data.ratings);
	let showAudit = $state(false);

	type ActionResult = { type: string; data?: Record<string, unknown> };

	// `use:enhance` handler: keep the result in local state instead of a full
	// page reload, so the radar/scrubber context is preserved.
	const enhanceAnalyze = () => {
		analyzing = true;
		llmNote = null;
		llmAlert = null;
		llmCost = null;
		return async ({ result }: { result: ActionResult }) => {
			analyzing = false;
			if (result.type !== 'success') {
				llmNote = 'Analysis failed.';
				return;
			}
			const body = result.data ?? {};
			if (typeof body.auditCount === 'number') auditCount = body.auditCount;
			if (Array.isArray(body.audit)) auditEntries = body.audit as typeof auditEntries;
			llmCost = (body.cost as typeof llmCost) ?? null;
			if (body.llm && body.alert) llmAlert = body.alert as Alert;
			else if (!body.llm)
				llmNote = 'No ANTHROPIC_API_KEY configured — showing the rule-based recommendation.';
			else llmNote = 'Composite below the alert threshold — no Stage 3 synthesis.';
		};
	};

	// HITL decision → append-only audit log (+ rating outcome on escalate).
	const enhanceDecide = () => {
		return async ({ result }: { result: ActionResult }) => {
			if (result.type !== 'success') return;
			const body = result.data ?? {};
			if (body.decided === 'escalate' || body.decided === 'dismiss') decision = body.decided;
			if (typeof body.auditCount === 'number') auditCount = body.auditCount;
			if (Array.isArray(body.audit)) auditEntries = body.audit as typeof auditEntries;
			if (typeof body.rating === 'string')
				ratings = { ...ratings, [selectedId]: body.rating as (typeof ratings)[string] };
		};
	};

	const asOfIso = $derived(new Date(asOf).toISOString());

	const book = $derived(
		data.book.map((e) => ({
			...e,
			drift: scoreDriftVector(e.baseline, e.signals, { asOf: asOfIso })
		}))
	);
	const selected = $derived(book.find((e) => e.baseline.entityId === selectedId) ?? book[0]);

	const AXIS_LABEL: Record<DriftAxis, string> = {
		business_model: 'Business model',
		ownership: 'Ownership / control',
		jurisdiction: 'Geography / jurisdiction',
		scale: 'Scale / activity',
		reputation: 'Reputation / media'
	};
	const statusVar: Record<RiskStatus, string> = {
		stable: 'var(--stable)',
		watch: 'var(--watch)',
		alert: 'var(--alert)'
	};

	// Cost cascade for the selected entity at the current clock.
	const funnel = $derived.by(() => {
		const sel = selected;
		if (!sel) return { s0: 0, s1: 5, s2: 0, s3: 0 };
		const s0 = sel.signals.filter((s) => s.date <= asOfIso).length;
		const s2 = AXES.filter((a) => sel.drift.axes[a].status !== 'stable').length;
		const s3 = sel.drift.status === 'alert' ? 1 : 0;
		return { s0, s1: 5, s2, s3 };
	});

	// Pattern-library match (reasoning by analogy).
	const archetype = $derived(data.patterns[0]);
	const alertingAxes = $derived(
		selected ? AXES.filter((a) => selected.drift.axes[a].status !== 'stable') : []
	);
	const patternSim = $derived.by(() => {
		if (!archetype || alertingAxes.length === 0) return 0;
		const set = new Set(archetype.axes);
		const overlap = alertingAxes.filter((a) => set.has(a)).length;
		const union = new Set([...alertingAxes, ...archetype.axes]).size;
		return overlap / union;
	});

	// Top citations from the axes that moved.
	const citations = $derived.by(() => {
		if (!selected) return [];
		return selected.signals
			.filter((s) => s.date <= asOfIso && alertingAxes.includes(s.axis))
			.sort((a, b) => b.confidence - a.confidence || b.date.localeCompare(a.date))
			.slice(0, 4);
	});

	const recommendedAction = $derived(
		selected?.drift.status === 'alert'
			? 'Re-run KYC: enhanced due diligence, refresh beneficial-ownership and business-purpose, escalate to MLRO.'
			: selected?.drift.status === 'watch'
				? 'Monitor: cheap tiers continue; no analyst action required yet.'
				: 'No action: baseline intact, absorbed by Stage 0/1 at ~$0.'
	);

	// Citations to render: the LLM's chosen ones when present, else rule-based.
	const displayCitations = $derived(
		llmAlert
			? llmAlert.citations.map((c, i) => ({
					key: c.signalId ?? `cite-${i}`,
					sourceUrl: c.sourceUrl,
					label: c.title
				}))
			: citations.map((s) => ({
					key: s.id,
					sourceUrl: s.sourceUrl,
					label: `${s.source} · ${s.title}`
				}))
	);

	function fmtDate(d: string) {
		return d.slice(0, 10);
	}
	$effect(() => {
		void selectedId;
		void asOf;
		decision = null;
		llmAlert = null;
		llmNote = null;
		llmCost = null;
	});
</script>

<div class="bg-bg text-text flex h-screen flex-col overflow-hidden p-3 font-mono text-sm">
	<!-- ── Top bar ─────────────────────────────────────────────────────── -->
	<header class="border-line flex items-center justify-between border-b pb-2">
		<div class="flex items-baseline gap-3">
			<span class="font-sans text-[13px] font-semibold tracking-[0.2em]">AMINA</span>
			<span class="text-muted2 text-[11px] tracking-[0.3em]">DRIFT MONITOR</span>
		</div>
		<div class="flex items-center gap-5 text-[11px]">
			<span class="flex items-center gap-1.5">
				<span class="h-1.5 w-1.5 animate-pulse rounded-full" style="background: var(--stable)"
				></span>
				<span class="text-muted2 tracking-widest">LIVE</span>
			</span>
			<span class="text-muted2">book <span class="text-text">{data.book.length}</span></span>
			<button
				class="text-muted2 hover:text-text transition-colors"
				onclick={() => (showAudit = true)}
				title="Open the append-only audit trail"
			>
				audit <span class="text-text underline-offset-2 hover:underline">{auditCount}</span>
			</button>
			<span class="text-muted2">cost/day <span class="text-stable">$0.75</span></span>
		</div>
	</header>

	<!-- ── Main grid ───────────────────────────────────────────────────── -->
	<div class="grid min-h-0 flex-1 grid-cols-[200px_1fr_220px] gap-3 py-3">
		<!-- Left rail · the book -->
		<aside class="border-line flex flex-col gap-1 border-r pr-3">
			<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">
				Book ({data.book.length})
			</div>
			{#each book as e (e.baseline.entityId)}
				{@const st = e.drift.status}
				<button
					class="group hover:bg-panel flex flex-col gap-1 rounded-sm border-l-2 px-2 py-1.5 text-left transition-colors"
					style="border-color: {selectedId === e.baseline.entityId
						? statusVar[st]
						: 'transparent'}; background: {selectedId === e.baseline.entityId
						? 'var(--panel)'
						: 'transparent'}"
					onclick={() => (selectedId = e.baseline.entityId)}
				>
					<div class="flex items-center justify-between">
						<span class="truncate font-sans text-[12px]">{e.baseline.name}</span>
						<span class="text-[11px]" style="color: {statusVar[st]}"
							>{e.drift.composite.toFixed(2)}</span
						>
					</div>
					<div class="bg-panel2 flex h-1 w-full overflow-hidden rounded-full">
						<div
							class="h-full rounded-full"
							style="width: {e.drift.composite * 100}%; background: {statusVar[
								st
							]}; transition: width 220ms cubic-bezier(0.2,0,0,1)"
						></div>
					</div>
				</button>
			{/each}

			<!-- Cost funnel -->
			<div class="border-line mt-auto border-t pt-2">
				<div class="text-muted2 mb-2 text-[10px] tracking-widest uppercase">Cost funnel</div>
				<div class="flex flex-col gap-1.5 text-[11px]">
					{#each [{ k: 'S0 rules', v: funnel.s0, c: 'var(--muted)' }, { k: 'S1 drift', v: funnel.s1, c: 'var(--muted)' }, { k: 'S2 axis-LLM', v: llmCost ? llmCost.stage2Calls : funnel.s2, c: 'var(--watch)' }, { k: 'S3 synth', v: funnel.s3, c: 'var(--alert)' }] as row (row.k)}
						<div class="flex items-center justify-between">
							<span class="text-muted2">{row.k}</span>
							<span style="color: {row.c}">{row.v}</span>
						</div>
					{/each}
				</div>
				{#if llmCost}
					<div class="border-line mt-2 flex flex-col gap-1 border-t pt-2 text-[11px]">
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
		</aside>

		<!-- Center · selected entity -->
		{#if selected}
			<main class="flex min-h-0 flex-col gap-3">
				<div class="flex items-start justify-between">
					<div>
						<h1 class="font-sans text-lg font-semibold tracking-tight">{selected.baseline.name}</h1>
						<p class="text-muted2 text-[11px]">
							{selected.baseline.jurisdiction} · onboarded {fmtDate(selected.baseline.onboardedAt)} ·
							baseline
							<span class="uppercase">{selected.baseline.riskRating}</span
							>{#if ratings[selectedId] && ratings[selectedId] !== selected.baseline.riskRating}<span
									class="uppercase"
									style="color: var(--alert)"
								>
									→ {ratings[selectedId]}</span
								>{/if}
						</p>
					</div>
					<div
						class="rounded-sm border px-3 py-1.5 text-right"
						style="border-color: {statusVar[selected.drift.status]}"
					>
						<div
							class="text-[10px] tracking-widest"
							style="color: {statusVar[selected.drift.status]}"
						>
							DRIFT {selected.drift.status.toUpperCase()}
						</div>
						<div class="text-2xl leading-none" style="color: {statusVar[selected.drift.status]}">
							{selected.drift.composite.toFixed(2)}
						</div>
					</div>
				</div>

				<div class="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4">
					<div class="flex items-center justify-center">
						<DriftRadar axes={selected.drift.axes} status={selected.drift.status} />
					</div>

					<div class="flex flex-col justify-center gap-2.5">
						{#each AXES as axis (axis)}
							{@const a = selected.drift.axes[axis]}
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
				</div>

				<!-- Escalation flare / RE-KYC alert -->
				{#if selected.drift.status === 'alert'}
					<div
						class="rounded-sm border p-3"
						style="border-color: var(--alert); background: color-mix(in oklab, var(--alert) 7%, transparent)"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-[11px] tracking-widest" style="color: var(--alert)"
									>⚠ RE-KYC ALERT</span
								>
								{#if llmAlert?.patternMatch}
									<span
										class="border-line rounded-full border px-2 py-0.5 text-[10px]"
										style="color: var(--alert)"
										title={llmAlert.patternMatch.outcome}
									>
										matches {llmAlert.patternMatch.archetypeName} · {(
											llmAlert.patternMatch.similarity * 100
										).toFixed(0)}%
									</span>
								{:else if archetype && patternSim >= 0.3}
									<span
										class="border-line text-muted2 rounded-full border px-2 py-0.5 text-[10px]"
										title={archetype.outcome}
									>
										matches {archetype.name} · {(patternSim * 100).toFixed(0)}%
									</span>
								{/if}
								{#if llmAlert}
									<span class="text-muted2 text-[10px]">· {llmAlert.modelVersion}</span>
								{/if}
							</div>
							<span class="text-muted2 text-[10px]">{fmtDate(asOfIso)}</span>
						</div>

						{#if llmAlert}
							<p class="text-text mt-2 text-[12px] leading-relaxed">{llmAlert.reasoning}</p>
							<p class="text-text mt-1 text-[12px] leading-relaxed">
								<span class="text-muted2">Recommended:</span>
								{llmAlert.recommendedAction}
							</p>
						{:else}
							<p class="text-text mt-2 text-[12px] leading-relaxed">{recommendedAction}</p>
						{/if}

						{#if displayCitations.length}
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each displayCitations as c (c.key)}
									<a
										href={c.sourceUrl}
										target="_blank"
										rel="noreferrer"
										class="border-line text-muted2 hover:text-text hover:border-muted2 max-w-[260px] truncate rounded-sm border px-2 py-0.5 text-[10px] transition-colors"
										title={c.label}
									>
										{c.label}
									</a>
								{/each}
							</div>
						{/if}

						<div class="mt-3 flex items-center gap-2">
							{#if decision}
								<span class="text-[11px]" style="color: var(--stable)">
									✓ {decision === 'escalate' ? 'Escalated to MLRO' : 'Dismissed'} · written to audit log
									(#{auditCount})
								</span>
							{:else}
								<form method="POST" action="?/decide" use:enhance={enhanceDecide}>
									<input type="hidden" name="entityId" value={selected.baseline.entityId} />
									<input type="hidden" name="decision" value="escalate" />
									<button
										type="submit"
										class="rounded-sm px-3 py-1 text-[11px] font-medium"
										style="background: var(--alert); color: var(--bg)">Escalate · re-KYC</button
									>
								</form>
								<form method="POST" action="?/decide" use:enhance={enhanceDecide}>
									<input type="hidden" name="entityId" value={selected.baseline.entityId} />
									<input type="hidden" name="decision" value="dismiss" />
									<button
										type="submit"
										class="border-line text-muted2 hover:text-text rounded-sm border px-3 py-1 text-[11px]"
										>Dismiss</button
									>
								</form>
								<form method="POST" action="?/analyze" use:enhance={enhanceAnalyze}>
									<input type="hidden" name="entityId" value={selected.baseline.entityId} />
									<input type="hidden" name="asOf" value={asOfIso} />
									<button
										type="submit"
										disabled={analyzing}
										class="border-line text-muted2 hover:text-text rounded-sm border px-3 py-1 text-[11px] disabled:opacity-50"
									>
										{analyzing ? 'Analyzing…' : 'Deep analysis · Stage 3'}
									</button>
								</form>
							{/if}
						</div>

						{#if llmNote}
							<p class="text-muted2 mt-2 text-[10px]">{llmNote}</p>
						{/if}
					</div>
				{/if}
			</main>

			<!-- Right rail · baseline + signals -->
			<aside class="border-line flex min-h-0 flex-col gap-3 border-l pl-3 text-[11px]">
				<div>
					<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Baseline</div>
					<p class="text-muted2 leading-relaxed">{selected.baseline.businessModel}</p>
				</div>
				<div>
					<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Identifiers</div>
					<div class="flex flex-col gap-0.5">
						{#if selected.baseline.cik}
							<div class="flex justify-between">
								<span class="text-muted2">SEC CIK</span><span>{selected.baseline.cik}</span>
							</div>
						{/if}
						{#if selected.baseline.domain}
							<div class="flex justify-between">
								<span class="text-muted2">domain</span><span class="truncate"
									>{selected.baseline.domain.replace('https://', '')}</span
								>
							</div>
						{/if}
						<div class="flex justify-between">
							<span class="text-muted2">signals</span><span>{selected.signals.length}</span>
						</div>
					</div>
				</div>
				<div class="flex min-h-0 flex-1 flex-col">
					<div class="text-muted2 mb-1 text-[10px] tracking-widest uppercase">Signals ≤ clock</div>
					<div class="flex flex-col gap-1 overflow-y-auto pr-1">
						{#each selected.signals.filter((s) => s.date <= asOfIso).slice(0, 16) as s (s.id)}
							<div class="border-line/60 flex flex-col border-b pb-1">
								<div class="flex justify-between">
									<span class="text-muted2 text-[10px]">{fmtDate(s.date)} · {s.axis}</span>
									<span
										class="text-[10px]"
										style="color: {statusVar[selected.drift.axes[s.axis].status]}"
										>{s.confidence.toFixed(2)}</span
									>
								</div>
								<span class="truncate text-[11px]">{s.title}</span>
							</div>
						{/each}
					</div>
				</div>
			</aside>
		{/if}
	</div>

	<!-- ── Bottom · timeline scrubber ──────────────────────────────────── -->
	<footer class="border-line border-t pt-2">
		{#if selected}
			<TimelineScrubber signals={selected.signals} start={startMs} end={endMs} bind:value={asOf} />
		{/if}
	</footer>
</div>

{#if showAudit}
	<AuditDrawer entries={auditEntries} onclose={() => (showAudit = false)} />
{/if}
