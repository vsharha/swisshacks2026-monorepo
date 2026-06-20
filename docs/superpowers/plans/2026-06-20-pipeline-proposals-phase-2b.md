# Pipeline Proposals — Phase 2b (Knowledge Graph + Risk Propagation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the relationship layer (proposal 3) and risk propagation (proposal 5)
from `pipeline-proposals.md`. A small graph derived from baselines (plus a
registry-style ownership-links reference) is walked to surface **hidden
beneficial ownership** and **Nth-degree exposure**, emitting canonical `ownership`
`Signal`s with a citable relationship path. A separate propagation pass turns a
*confirmed* drift on one entity into a cheap re-trigger on its graph neighbours.

**Architecture:** New `@kyc/core/graph` module (pure: schemas + `buildGraph` +
walk utilities). Graph-derived findings are emitted as normal `Signal`s through a
new deterministic enricher (`pipeline/enrichers/graph.ts`) and a propagation
function (`pipeline/propagate.ts`), so Stage 0/1/2/3 consume them unchanged. The
`Alert` gains an optional `relationshipPaths` field (the edge chain that produced
the risk) — additive, deferred here from the 2a self-review. An offline script
(`@kyc/scripts/graph.ts`) builds the book graph, runs the enricher and writes
`data/signals/<entity>.graph.json`; `loadBook` already globs every per-entity
signal file, so the live app picks them up with no live-path change.

**Tech Stack:** TypeScript (ESM, `.ts` import specifiers), Zod v4, Vitest, pnpm workspaces.

## Global Constraints

- **Additive only.** Schema changes are limited to: one new schema file
  (`schemas/graph.ts`), one optional `Alert.relationshipPaths` field, and one
  `SourceSchema` enum value (`graph`). Existing `data/` fixtures must still parse.
- **`graph` source prior:** graph inference is weaker than a primary list hit, so
  `SOURCE_QUALITY.graph = 0.70`. It carries the *reach*; the originating evidence
  keeps its own confidence and is referenced in the signal payload.
- **Core stays framework-agnostic:** the graph module takes baselines (and an
  optional external-edges array) and returns plain data. No `process.env`, no
  `fs` reads in core. The ownership-links reference is loaded by the script and
  passed in (like the sanctions fixture in 2a).
- **Every `Signal` needs a real `sourceUrl`** (`z.url()`). Graph signals cite the
  originating risk's `sourceUrl` (e.g. the sanctions entry) — the reachable risk
  *is* the source; the path is explanation.
- **Determinism:** `buildGraph`, the walk and the signal generators take an
  explicit `asOf: string` where a date is needed, and produce stable, sorted
  output (deterministic node/edge/path ordering) so tests and the script repeat.
- **Proposal 3 vs 5 — no double-counting.** The book-wide offline pass emits the
  *static* graph-risk signals (proposal 3: an entity reaches a risk-bearing node
  through a chain). Propagation (proposal 5: a *confirmed* drift becomes a
  re-trigger on neighbours) is a runtime function used by the escalation path; it
  is unit-tested but **not** also written into the static `.graph.json` files, so
  the same hidden-controller fact is not represented twice.
- **Commit style (AGENTS.md):** commit as the user; short title only; **NO
  description block, NO co-author trailer.** Do not stage unrelated pre-existing
  changes.
- **Before each commit, when code changed:** `pnpm check`, then `pnpm fix`, then `pnpm lint`.

## Interfaces produced by this plan (cross-task contract)

- `@kyc/core/schemas` (re-exported from `@kyc/core`): `GraphNodeType`,
  `GraphEdgeType`, `GraphNode`, `GraphEdge`, `RiskGraph`, `RelationshipPath` (+
  their `*Schema`s); `Alert.relationshipPaths?: RelationshipPath[]`.
- `@kyc/core/graph`: `nodeIdFor(name, type)`, `buildGraph(baselines, extraEdges?)`,
  `neighbors(graph, nodeId)`, `findPaths(graph, startId, isTarget, maxDepth)`,
  `connectedEntities(graph, entityId, maxDepth)`.
- `@kyc/core/pipeline`: `riskNodeIds(graph, entries, asOf?)`,
  `graphRiskSignals(baseline, graph, riskIds, asOf)`,
  `propagateConfirmedDrift(graph, confirmedEntityId, asOf)`.
- `SourceSchema` gains `"graph"`; `SOURCE_QUALITY.graph = 0.70`.
- `synthesizeAlert` / `runEscalation` accept an optional `relationshipPaths`.
- `@kyc/scripts` gains `graph.ts`; `data/reference/ownership-links.json` and the
  edited NordTrade baseline drive the demo (NordTrade → Caspian Holdings →
  sanctioned Viktor Petrov, the controller it shares with Gulf Bridge Capital).

---

### Task 1: Graph schemas + `graph` source + `Alert.relationshipPaths`

**Files:** create `packages/core/src/schemas/graph.ts` (+ test); modify
`schemas/common.ts` (add `graph` source), `schemas/alert.ts`, `schemas/index.ts`,
`drift/confidence.ts` (`SOURCE_QUALITY.graph = 0.70`) + its test.

**Schemas:**
- `GraphNodeTypeSchema = z.enum(["entity","individual","investor","country","wallet","exchange","regulator"])` — full `datastructure.md` vocabulary; this phase populates entity/individual/investor/country.
- `GraphEdgeTypeSchema = z.enum(["OWNS","CONTROLS","INVESTED_IN","PARTNERS_WITH","OPERATES_IN","TRANSACTS_WITH","BOARD_MEMBER_OF"])`.
- `GraphNodeSchema = { id, type, label, country?: ISO alpha-2 }`.
- `GraphEdgeSchema = { from, to, type, weight?: Score, note?, sourceUrl? }`.
- `RiskGraphSchema = { nodes: GraphNode[], edges: GraphEdge[] }`.
- `RelationshipPathSchema = { nodes: {id,label,type}[] (min 2), edges: GraphEdgeType[] }` — the edge chain (`entity → UBO → sanctioned party`).
- `AlertSchema.relationshipPaths: z.array(RelationshipPathSchema).default([])`.

Tests: each schema parses a minimal example; existing `long-blockchain` alert /
baselines still parse; `sourceQuality("graph")` ≈ 0.70 and below `opensanctions`.

### Task 2: `buildGraph`

**Files:** create `packages/core/src/graph/build.ts` + `index.ts` (+ test);
add `"./graph": "./src/graph/index.ts"` to `packages/core/package.json` exports.

- `nodeIdFor(name, type)`: lowercase, whitespace-collapsed; `person:<n>` for
  individual/investor, `org:<n>` for entity, `country:<code>` for country.
- Org-like owner names (suffix Ltd/AG/SA/GmbH/Inc/Corp/Holding/Holdings/Nominees/
  Capital/Partners/Group) → an `entity`/`investor` node; otherwise `individual`.
- Edge type from owner role: `/invest/` → `INVESTED_IN`; `/board|director|chair/`
  → `BOARD_MEMBER_OF`; `share≥0.5` or `/parent|majority|controll|ultimate|nominee/`
  → `CONTROLS`; else `OWNS`.
- Entity → jurisdiction country: `OPERATES_IN`.
- `buildGraph(baselines, extraEdges = [])` dedups nodes by id, merges `extraEdges`
  (registry-style links the book itself can't express), returns sorted nodes/edges.

### Task 3: Graph walk utilities

**Files:** create `packages/core/src/graph/walk.ts` (+ test).

- `neighbors(graph, nodeId)`: edges touching the node (undirected adjacency).
- `findPaths(graph, startId, isTarget, maxDepth=3)`: BFS over undirected edges,
  no revisits, returns every `RelationshipPath` from `start` to a target node
  within `maxDepth` hops, shortest-first then lexicographic (deterministic).
- `connectedEntities(graph, entityId, maxDepth=2)`: other `entity` nodes reachable,
  each with its shortest `RelationshipPath` — the propagation frontier.

### Task 4: `graphRiskSignals` enricher (proposal 3)

**Files:** create `packages/core/src/pipeline/enrichers/graph.ts` (+ test);
export from `pipeline/index.ts`.

- `riskNodeIds(graph, entries, asOf?)`: node ids that bear risk — `individual`/
  `investor`/`entity` nodes whose label `matchSanctions` hits, plus `country`
  nodes that are non-standard `countryRisk`. Returns `Map<nodeId, {sourceUrl,
  title, confidence}>` so the signal can cite the origin.
- `graphRiskSignals(baseline, graph, riskIds, asOf)`: from the entity node,
  `findPaths` to any risk node; **emit only for paths ≥ 2 edges** (1-hop direct
  ownership is screen's job — proposal 6), one `ownership` `Signal` per reached
  risk: `source:"graph"`, `type:"graph_exposure"`, confidence = origin confidence
  × `0.6^(hops−1)` (distance decay), `payload.path` = the `RelationshipPath`,
  `sourceUrl` = origin's. Dedup to the shortest path per risk node.

### Task 5: `propagateConfirmedDrift` (proposal 5)

**Files:** create `packages/core/src/pipeline/propagate.ts` (+ test); export it.

- `propagateConfirmedDrift(graph, confirmedEntityId, asOf, opts?)`: for each
  `connectedEntities(graph, confirmedEntityId, maxDepth)`, emit one `ownership`
  re-trigger `Signal` on the neighbour (`source:"graph"`,
  `type:"propagated_risk"`, confidence decaying with distance from a base), with
  the path in `payload`. This is the runtime re-trigger; the docstring states it
  is invoked when Stage 2/3 *confirms* a drift, and is not part of the static
  offline pass (see Global Constraints).

### Task 6: Wire `relationshipPaths` into Stage 3

**Files:** modify `pipeline/stage3.ts`, `pipeline/escalate.ts` (+ a test).

- `SynthesizeAlertParams` gains optional `relationshipPaths?: RelationshipPath[]`;
  the assembled `Alert` includes them (default `[]`). `runEscalation` derives them
  from the evidence signals' `payload.path` (the graph signals) and passes them
  in. Omitting them is byte-for-byte the current behaviour.

### Task 7: Demo data + graph extract script

**Files:** edit `data/baselines/nordtrade-holding.json`; create
`data/reference/ownership-links.json`, `packages/scripts/src/graph.ts`; generate
`data/signals/*.graph.json`.

- NordTrade owner becomes `Caspian Holdings Ltd` (role: parent / nominee structure).
- `ownership-links.json`: the registry-derived hidden link — `Viktor Petrov`
  **CONTROLS** `Caspian Holdings Ltd` (with a GLEIF/registry `sourceUrl`). Viktor
  Petrov is already a sanctioned Gulf Bridge owner, so the graph now reaches him
  from NordTrade at 2 hops (NordTrade → Caspian → Viktor Petrov).
- `graph.ts`: load the book + sanctions fixture + ownership-links, `buildGraph`,
  compute `riskNodeIds`, run `graphRiskSignals` per entity, write each non-empty
  result to `data/signals/<entity>.graph.json`. Print a per-entity summary.
- Verify: NordTrade gets a 2-hop `graph_exposure` ownership signal; Gulf Bridge
  does **not** (its sanctioned owner is 1-hop, already covered by the screen).

### Task 8: Update pipeline docs + status

**Files:** `docs/reference/pipeline-proposals.md` (mark 3 + 5 done, bump the
count), `docs/reference/pipeline.md` (add the relationship-graph layer + the
`graph` source row / note).

---

## Self-Review

**Spec coverage (Phase 2b scope):**
- Proposal 3 (knowledge graph / graph-risk signal) → Tasks 1–4, 6, 7. ✅
- Proposal 5 (graph propagation as a re-trigger) → Task 5 (+ runtime wiring note). ✅
- `Alert.relationshipPath` deferred from 2a → Task 1 + 6 (as `relationshipPaths`). ✅

**Placeholder scan:** none — every task names concrete files and signatures.

**Type consistency:** `RiskGraph`/`GraphNode`/`GraphEdge`/`RelationshipPath`
defined in Task 1, consumed by 2–7. `buildGraph` (Task 2) feeds the walk (Task 3),
which feeds the enricher/propagation (Tasks 4–5). The Task 7 ownership-link's
`Viktor Petrov` matches the 2a sanctions fixture entry and the Gulf Bridge owner.
