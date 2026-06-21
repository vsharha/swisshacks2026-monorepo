<script lang="ts">
	import type { GraphEdgeType, GraphNode, RiskGraph } from '@kyc/core';
	import type { BookEntity } from '$lib/view';

	let { entity, graph, asOfIso }: { entity: BookEntity; graph: RiskGraph; asOfIso: string } =
		$props();

	// SVG user-space box; the <svg> scales to the card width via viewBox.
	const W = 440;
	const H = 300;
	const CX = W / 2;
	const CY = H / 2 + 2;
	const R = 102;

	type Flag = 'sanction' | 'pep';

	// Screening hits on this entity's owners, revealed as the timeline clock passes
	// each hit's date — so a node turns red/amber in step with the radar replay.
	const flags = $derived.by(() => {
		const m: Record<string, { kind: Flag; list: string }> = {};
		for (const s of entity.signals) {
			if (s.source !== 'opensanctions' || s.date > asOfIso) continue;
			const owner = typeof s.payload.owner === 'string' ? s.payload.owner.toLowerCase() : null;
			if (!owner) continue;
			const kind: Flag = s.payload.matchType === 'sanction' ? 'sanction' : 'pep';
			const list = typeof s.payload.list === 'string' ? s.payload.list : '';
			const prev = m[owner];
			// A sanction outranks a PEP hit on the same person.
			if (!prev || (prev.kind === 'pep' && kind === 'sanction')) m[owner] = { kind, list };
		}
		return m;
	});

	const REL_LABEL: Record<GraphEdgeType, string> = {
		OWNS: 'owns',
		CONTROLS: 'controls',
		INVESTED_IN: 'invests',
		PARTNERS_WITH: 'partner',
		OPERATES_IN: 'domiciled',
		TRANSACTS_WITH: 'transacts',
		BOARD_MEMBER_OF: 'board'
	};

	const TYPE_LABEL: Record<GraphNode['type'], string> = {
		entity: 'Entity',
		individual: 'Individual',
		investor: 'Investor',
		country: 'Country',
		wallet: 'Wallet',
		exchange: 'Exchange',
		regulator: 'Regulator'
	};

	type Placed = {
		node: GraphNode;
		rel: GraphEdgeType;
		weight: number | undefined;
		flag: { kind: Flag; list: string } | undefined;
		x: number;
		y: number;
	};

	// The selected entity's node plus its immediate neighbourhood (owners /
	// controllers / board → entity, and entity → domicile country), laid out
	// radially around the centre.
	const model = $derived.by(() => {
		const center = graph.nodes.find((n) => n.entityId === entity.baseline.entityId);
		if (!center) return null;
		const byId = new Map(graph.nodes.map((n) => [n.id, n]));

		const neighbors = graph.edges
			.map((e) => {
				const otherId = e.to === center.id ? e.from : e.from === center.id ? e.to : null;
				const node = otherId ? byId.get(otherId) : undefined;
				return node ? { node, rel: e.type, weight: e.weight } : null;
			})
			.filter((n): n is { node: GraphNode; rel: GraphEdgeType; weight: number | undefined } =>
				Boolean(n)
			);

		// Readable order: controllers/owners first, domicile last.
		const order: GraphEdgeType[] = [
			'CONTROLS',
			'OWNS',
			'INVESTED_IN',
			'BOARD_MEMBER_OF',
			'PARTNERS_WITH',
			'TRANSACTS_WITH',
			'OPERATES_IN'
		];
		neighbors.sort((a, b) => order.indexOf(a.rel) - order.indexOf(b.rel));

		const n = Math.max(neighbors.length, 1);
		const placed: Placed[] = neighbors.map((nb, i) => {
			const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
			return {
				...nb,
				flag: flags[nb.node.label.toLowerCase()],
				x: CX + R * Math.cos(a),
				y: CY + R * Math.sin(a)
			};
		});
		return { center, placed };
	});

	function nodeFill(flag: Flag | undefined, type: GraphNode['type']): string {
		if (flag === 'sanction') return 'var(--alert)';
		if (flag === 'pep') return 'var(--watch)';
		if (type === 'country') return 'var(--panel-2)';
		return 'var(--galaxy)';
	}

	const edgeStroke = (p: Placed) =>
		p.flag === undefined
			? 'var(--line-2)'
			: p.flag.kind === 'sanction'
				? 'var(--alert)'
				: 'var(--watch)';
	const strokeWidth = (weight: number | undefined) =>
		weight === undefined ? 1.4 : 1.2 + weight * 4.5;

	let hovered = $state<string | null>(null);
	const active = $derived(model?.placed.find((p) => p.node.id === hovered) ?? null);
</script>

<div class="border-line bg-panel flex shrink-0 flex-col gap-2 rounded-lg border p-4">
	<div class="flex items-center justify-between gap-3">
		<div class="text-muted2 text-[10px] tracking-[0.16em] uppercase">
			Ownership &amp; control graph
		</div>
		<div class="text-muted2 flex items-center gap-3 text-[9px]">
			<span class="flex items-center gap-1">
				<span class="h-2 w-2 rounded-full" style="background: var(--galaxy)"></span>Owner
			</span>
			<span class="flex items-center gap-1">
				<span class="h-2 w-2 rounded-full" style="background: var(--watch)"></span>PEP
			</span>
			<span class="flex items-center gap-1">
				<span class="h-2 w-2 rounded-full" style="background: var(--alert)"></span>Sanctioned
			</span>
		</div>
	</div>

	{#if model}
		<div class="relative">
			<svg
				viewBox="0 0 {W} {H}"
				width="100%"
				height={H}
				class="block"
				role="img"
				aria-label="Ownership and control graph for {entity.baseline.name}"
			>
				<!-- edges (thickness ∝ ownership share) -->
				{#each model.placed as p (p.node.id + '-edge')}
					<line
						x1={CX}
						y1={CY}
						x2={p.x}
						y2={p.y}
						stroke={edgeStroke(p)}
						stroke-width={strokeWidth(p.weight)}
						stroke-linecap="round"
						opacity={hovered && hovered !== p.node.id ? 0.2 : 0.85}
					/>
				{/each}

				<!-- relationship labels -->
				{#each model.placed as p (p.node.id + '-rel')}
					<text
						x={CX + (p.x - CX) * 0.56}
						y={CY + (p.y - CY) * 0.56}
						fill="var(--muted)"
						font-size="8.5"
						font-family="var(--font-mono)"
						text-anchor="middle"
						dominant-baseline="middle"
						letter-spacing="0.04em"
						class="pointer-events-none select-none"
						opacity={hovered && hovered !== p.node.id ? 0.2 : 1}
					>
						{REL_LABEL[p.rel]}{p.weight !== undefined ? ` · ${Math.round(p.weight * 100)}%` : ''}
					</text>
				{/each}

				<!-- neighbour nodes -->
				{#each model.placed as p (p.node.id)}
					{@const isCountry = p.node.type === 'country'}
					<g
						role="listitem"
						aria-label={p.node.label}
						onpointerenter={() => (hovered = p.node.id)}
						onpointerleave={() => (hovered = hovered === p.node.id ? null : hovered)}
					>
						<circle
							cx={p.x}
							cy={p.y}
							r={isCountry ? 11 : 9}
							fill={nodeFill(p.flag?.kind, p.node.type)}
							stroke="var(--panel)"
							stroke-width="2"
							class:animate-pulse={p.flag?.kind === 'sanction'}
						/>
						<text
							x={p.x}
							y={p.y + (isCountry ? 23 : 21)}
							fill="var(--text-2)"
							font-size="9.5"
							text-anchor="middle"
							dominant-baseline="middle"
							class="pointer-events-none select-none">{p.node.label}</text
						>
					</g>
				{/each}

				<!-- centre entity -->
				<circle
					cx={CX}
					cy={CY}
					r="13"
					fill="var(--brand)"
					stroke="var(--panel)"
					stroke-width="2.5"
				/>
				<text
					x={CX}
					y={CY + 29}
					fill="var(--text)"
					font-size="10.5"
					font-weight="600"
					text-anchor="middle"
					dominant-baseline="middle"
					class="pointer-events-none select-none">{entity.baseline.name}</text
				>
			</svg>

			{#if active}
				<div
					class="border-line bg-panel2 text-text2 pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-[10px] shadow-lg"
					style="left: {(active.x / W) * 100}%; top: calc({(active.y / H) * 100}% - 14px)"
				>
					<div class="text-text font-medium">{active.node.label}</div>
					<div class="text-muted2">
						{TYPE_LABEL[active.node.type]}{active.node.country ? ` · ${active.node.country}` : ''}
					</div>
					<div class="text-muted2">
						{#if active.node.type === 'country'}
							Domicile of {entity.baseline.name}
						{:else}
							{REL_LABEL[active.rel]}
							{entity.baseline.name}{active.weight !== undefined
								? ` · ${Math.round(active.weight * 100)}% share`
								: ''}
						{/if}
					</div>
					{#if active.flag}
						<div style="color: {active.flag.kind === 'sanction' ? 'var(--alert)' : 'var(--watch)'}">
							{active.flag.kind === 'sanction' ? 'Sanctions hit' : 'PEP'} · {active.flag.list}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="text-muted2 py-8 text-center text-[11px]">
			No relationship data for this entity.
		</div>
	{/if}
</div>
