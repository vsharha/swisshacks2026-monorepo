<script lang="ts">
	import type { GraphEdgeType, GraphNode, RiskGraph } from '@kyc/core';
	import type { BookEntity } from '$lib/view';

	let { entity, graph, asOfIso }: { entity: BookEntity; graph: RiskGraph; asOfIso: string } =
		$props();

	type Flag = 'sanction' | 'pep';
	type PathNode = { id: string; label: string; type: GraphNode['type'] };

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

	type RiskPath = {
		hop1: PathNode;
		hop2: PathNode;
		edge1: GraphEdgeType;
		edge2: GraphEdgeType;
		reason: string;
	};

	// Normalised 2-hop risk paths from this entity's `graph` signals, oriented so
	// each chain reads outward from the selected entity: entity → conduit → origin.
	const riskPaths = $derived.by<RiskPath[]>(() => {
		const center = graph.nodes.find((n) => n.entityId === entity.baseline.entityId);
		if (!center) return [];
		const out: RiskPath[] = [];
		for (const s of entity.signals) {
			if (s.source !== 'graph' || s.date > asOfIso) continue;
			const path = s.payload.path as { nodes?: PathNode[]; edges?: GraphEdgeType[] } | undefined;
			if (!path?.nodes || path.nodes.length < 3 || !path.edges || path.edges.length < 2) continue;
			let nodes = path.nodes;
			let edges = path.edges;
			// Orient so nodes[0] is the selected entity (paths may point either way).
			if (nodes[nodes.length - 1].id === center.id) {
				nodes = [...nodes].reverse();
				edges = [...edges].reverse();
			}
			if (nodes[0].id !== center.id) continue;
			out.push({
				hop1: nodes[1],
				hop2: nodes[2],
				edge1: edges[0],
				edge2: edges[1],
				reason: typeof s.payload.origin === 'string' ? s.payload.origin : s.title
			});
		}
		return out;
	});

	const hasRisk = $derived(riskPaths.length > 0);

	// The graph grows to fit an outer ring only when transitive risk paths exist.
	const dim = $derived(
		hasRisk
			? { W: 480, H: 400, CX: 240, CY: 200, R: 92, RO: 162 }
			: { W: 440, H: 300, CX: 220, CY: 152, R: 102, RO: 0 }
	);

	type Placed = {
		node: GraphNode;
		rel: GraphEdgeType;
		weight: number | undefined;
		flag: { kind: Flag; list: string } | undefined;
		risk: boolean;
		x: number;
		y: number;
	};
	type Outer = {
		id: string;
		label: string;
		type: GraphNode['type'];
		edge: GraphEdgeType;
		reason: string;
		ax: number;
		ay: number;
		x: number;
		y: number;
	};

	// The selected entity's node, its immediate neighbourhood (owners / controllers
	// / board → entity, entity → domicile country) laid out radially, plus any
	// 2-hop risk endpoints placed on an outer ring beyond their conduit neighbour.
	const model = $derived.by(() => {
		const d = dim;
		const center = graph.nodes.find((n) => n.entityId === entity.baseline.entityId);
		if (!center) return null;
		const byId = new Map(graph.nodes.map((n) => [n.id, n]));

		const seen: Record<string, true> = {};
		const neighbors: { node: GraphNode; rel: GraphEdgeType; weight: number | undefined }[] = [];
		for (const e of graph.edges) {
			const otherId = e.to === center.id ? e.from : e.from === center.id ? e.to : null;
			const node = otherId ? byId.get(otherId) : undefined;
			if (!node || seen[node.id]) continue;
			seen[node.id] = true;
			neighbors.push({ node, rel: e.type, weight: e.weight });
		}
		// A risk path's conduit is normally a direct owner; add it if the book graph
		// didn't already express that edge, so the outer endpoint has an anchor.
		for (const rp of riskPaths) {
			if (seen[rp.hop1.id]) continue;
			seen[rp.hop1.id] = true;
			neighbors.push({
				node: { id: rp.hop1.id, type: rp.hop1.type, label: rp.hop1.label },
				rel: rp.edge1,
				weight: undefined
			});
		}

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

		const riskAnchors: Record<string, true> = {};
		for (const r of riskPaths) riskAnchors[r.hop1.id] = true;
		const angleFor: Record<string, number> = {};
		const n = Math.max(neighbors.length, 1);
		const placed: Placed[] = neighbors.map((nb, i) => {
			const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
			angleFor[nb.node.id] = a;
			return {
				...nb,
				flag: flags[nb.node.label.toLowerCase()],
				risk: Boolean(riskAnchors[nb.node.id]),
				x: d.CX + d.R * Math.cos(a),
				y: d.CY + d.R * Math.sin(a)
			};
		});

		// Outer risk endpoints, fanned out beyond their conduit when several share it.
		const byAnchor: Record<string, RiskPath[]> = {};
		for (const rp of riskPaths) (byAnchor[rp.hop1.id] ??= []).push(rp);
		const outer: Outer[] = [];
		for (const [anchorId, rps] of Object.entries(byAnchor)) {
			const base = angleFor[anchorId];
			const anchor = placed.find((p) => p.node.id === anchorId);
			if (base === undefined || !anchor) continue;
			rps.forEach((rp, k) => {
				const a = base + (k - (rps.length - 1) / 2) * 0.34;
				outer.push({
					id: rp.hop2.id,
					label: rp.hop2.label,
					type: rp.hop2.type,
					edge: rp.edge2,
					reason: rp.reason,
					ax: anchor.x,
					ay: anchor.y,
					x: d.CX + d.RO * Math.cos(a),
					y: d.CY + d.RO * Math.sin(a)
				});
			});
		}

		return { center, placed, outer, d };
	});

	function nodeFill(flag: Flag | undefined, type: GraphNode['type']): string {
		if (flag === 'sanction') return 'var(--alert)';
		if (flag === 'pep') return 'var(--watch)';
		if (type === 'country') return 'var(--panel-2)';
		return 'var(--galaxy)';
	}

	const edgeStroke = (p: Placed) =>
		p.risk || p.flag?.kind === 'sanction'
			? 'var(--alert)'
			: p.flag?.kind === 'pep'
				? 'var(--watch)'
				: 'var(--line-2)';
	const strokeWidth = (weight: number | undefined) =>
		weight === undefined ? 1.4 : 1.2 + weight * 4.5;

	let hovered = $state<string | null>(null);
	const active = $derived.by(() => {
		if (!model || !hovered) return null;
		const p = model.placed.find((q) => q.node.id === hovered);
		if (p) return { kind: 'direct' as const, p };
		const o = model.outer.find((q) => q.id === hovered);
		if (o) return { kind: 'outer' as const, o };
		return null;
	});
</script>

<div class="border-line bg-panel flex min-h-0 flex-1 flex-col gap-2 rounded-lg border p-4">
	<div class="flex items-center justify-between gap-3">
		<div class="text-muted2 text-[10px] tracking-[0.16em] uppercase">
			Ownership &amp; control graph
		</div>
		<div class="text-muted2 flex items-center gap-3 text-[9px]">
			<span class="flex items-center gap-1">
				<span class="h-2 w-2 rounded-full" style="background: var(--brand)"></span>Customer
			</span>
			<span class="flex items-center gap-1">
				<span class="h-2 w-2 rounded-full" style="background: var(--galaxy)"></span>Owner
			</span>
			<span class="flex items-center gap-1">
				<span class="h-2 w-2 rounded-full" style="background: var(--watch)"></span>PEP
			</span>
			<span class="flex items-center gap-1">
				<span class="h-2 w-2 rounded-full" style="background: var(--alert)"></span>Sanctioned
			</span>
			{#if hasRisk}
				<span class="flex items-center gap-1">
					<svg width="16" height="6" class="overflow-visible"
						><line
							x1="0"
							y1="3"
							x2="16"
							y2="3"
							stroke="var(--alert)"
							stroke-width="1.6"
							stroke-dasharray="4 3"
						/></svg
					>2-hop risk
				</span>
			{/if}
		</div>
	</div>

	{#if model}
		<div class="flex min-h-0 flex-1 items-center">
			<div class="relative w-full">
				<svg
					viewBox="0 0 {model.d.W} {model.d.H}"
					width="100%"
					height={model.d.H}
					class="block"
					role="img"
					aria-label="Ownership and control graph for {entity.baseline.name}"
				>
					<!-- direct edges (thickness ∝ ownership share) -->
					{#each model.placed as p (p.node.id + '-edge')}
						<line
							x1={model.d.CX}
							y1={model.d.CY}
							x2={p.x}
							y2={p.y}
							stroke={edgeStroke(p)}
							stroke-width={strokeWidth(p.weight)}
							stroke-linecap="round"
							opacity={hovered && hovered !== p.node.id ? 0.2 : 0.85}
						/>
					{/each}

					<!-- 2-hop risk edges (conduit → origin) -->
					{#each model.outer as o (o.id + '-edge')}
						<line
							x1={o.ax}
							y1={o.ay}
							x2={o.x}
							y2={o.y}
							stroke="var(--alert)"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-dasharray="4 3"
							opacity={hovered && hovered !== o.id ? 0.25 : 0.9}
						/>
					{/each}

					<!-- relationship labels -->
					{#each model.placed as p (p.node.id + '-rel')}
						<text
							x={model.d.CX + (p.x - model.d.CX) * 0.56}
							y={model.d.CY + (p.y - model.d.CY) * 0.56}
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
					{#each model.outer as o (o.id + '-rel')}
						<text
							x={o.ax + (o.x - o.ax) * 0.5}
							y={o.ay + (o.y - o.ay) * 0.5}
							fill="var(--alert-deep)"
							font-size="8"
							font-family="var(--font-mono)"
							text-anchor="middle"
							dominant-baseline="middle"
							letter-spacing="0.04em"
							class="pointer-events-none select-none"
							opacity={hovered && hovered !== o.id ? 0.25 : 1}>{REL_LABEL[o.edge]}</text
						>
					{/each}

					<!-- direct neighbour nodes -->
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

					<!-- outer risk nodes -->
					{#each model.outer as o (o.id)}
						<g
							role="listitem"
							aria-label={o.label}
							onpointerenter={() => (hovered = o.id)}
							onpointerleave={() => (hovered = hovered === o.id ? null : hovered)}
						>
							<circle
								cx={o.x}
								cy={o.y}
								r="8"
								fill="var(--alert)"
								stroke="var(--panel)"
								stroke-width="2"
								class="animate-pulse"
							/>
							<text
								x={o.x}
								y={o.y + 20}
								fill="var(--alert-deep)"
								font-size="9.5"
								text-anchor="middle"
								dominant-baseline="middle"
								class="pointer-events-none select-none">{o.label}</text
							>
						</g>
					{/each}

					<!-- centre entity -->
					<circle
						cx={model.d.CX}
						cy={model.d.CY}
						r="13"
						fill="var(--brand)"
						stroke="var(--panel)"
						stroke-width="2.5"
						class="animate-pulse"
					/>
					<text
						x={model.d.CX}
						y={model.d.CY + 29}
						fill="var(--text)"
						font-size="10.5"
						font-weight="600"
						text-anchor="middle"
						dominant-baseline="middle"
						class="pointer-events-none select-none">{entity.baseline.name}</text
					>
				</svg>

				{#if active}
					{@const a =
						active.kind === 'direct'
							? { x: active.p.x, y: active.p.y }
							: { x: active.o.x, y: active.o.y }}
					<div
						class="border-line bg-panel2 text-text2 pointer-events-none absolute z-10 max-w-[240px] -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-[10px] shadow-lg"
						style="left: {(a.x / model.d.W) * 100}%; top: calc({(a.y / model.d.H) * 100}% - 14px)"
					>
						{#if active.kind === 'direct'}
							<div class="text-text font-medium">{active.p.node.label}</div>
							<div class="text-muted2">
								{TYPE_LABEL[active.p.node.type]}{active.p.node.country
									? ` · ${active.p.node.country}`
									: ''}
							</div>
							<div class="text-muted2">
								{#if active.p.node.type === 'country'}
									Domicile of {entity.baseline.name}
								{:else}
									{REL_LABEL[active.p.rel]}
									{entity.baseline.name}{active.p.weight !== undefined
										? ` · ${Math.round(active.p.weight * 100)}% share`
										: ''}
								{/if}
							</div>
							{#if active.p.flag}
								<div
									style="color: {active.p.flag.kind === 'sanction'
										? 'var(--alert)'
										: 'var(--watch)'}"
								>
									{active.p.flag.kind === 'sanction' ? 'Sanctions hit' : 'PEP'} · {active.p.flag
										.list}
								</div>
							{/if}
						{:else}
							<div class="text-text font-medium">{active.o.label}</div>
							<div class="text-muted2">{TYPE_LABEL[active.o.type]}</div>
							<div style="color: var(--alert)">2-hop risk path</div>
							<div class="text-muted2 leading-snug">{active.o.reason}</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="text-muted2 py-8 text-center text-[11px]">
			No relationship data for this entity.
		</div>
	{/if}
</div>
