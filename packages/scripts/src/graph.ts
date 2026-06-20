import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  GraphEdgeTypeSchema,
  GraphNodeTypeSchema,
  KYCBaselineSchema,
  type GraphEdge,
  type KYCBaseline,
  type Signal,
} from "@kyc/core";
import { buildGraph, neighbors, nodeIdFor } from "@kyc/core/graph";
import { graphRiskSignals, propagateConfirmedDrift, riskNodeIds } from "@kyc/core/pipeline";
import { SanctionsEntrySchema } from "@kyc/core/connectors";
import { readData, repoRoot, writeData } from "./lib/repo.ts";

/**
 * Offline graph pass (proposals 3 + 5): build the relationship graph from the
 * whole book + a registry-style ownership-links reference, mark the risk-bearing
 * nodes (sanctioned people/vehicles, high-risk countries), then:
 *   • proposal 3 — emit `graph_exposure` Signals for entities that reach risk
 *     through a 1st/2nd-degree chain (standing hidden-controller exposure);
 *   • proposal 5 — treat an entity with a *direct* sanctioned owner as a
 *     confirmed drift and propagate `propagated_risk` re-triggers onto its
 *     customer neighbours, reaching entities beyond the static window.
 * Writes data/signals/<entityId>.graph.json, which the live app loads like any
 * source.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/graph.ts [asOf]
 */

const asOf = process.argv[2] ?? "2026-06-20";

// Load every baseline in the book.
const baselineDir = join(repoRoot, "data", "baselines");
const files = (await readdir(baselineDir)).filter((f) => f.endsWith(".json"));
const baselines: KYCBaseline[] = [];
for (const f of files) baselines.push(KYCBaselineSchema.parse(await readData(`baselines/${f}`)));

// Sanctions/PEP reference (the risk-bearing names).
const entries = SanctionsEntrySchema.array().parse(
  await readData("reference/sanctions-sample.json"),
);

// Registry-style ownership links the baselines can't express, authored by
// name + type and resolved to graph node ids here. Field-level validation reuses
// the exported graph enums (no direct zod dependency, matching screen.ts).
interface OwnershipLink {
  from: { name: string; type: string };
  to: { name: string; type: string };
  type: string;
  note?: string;
  sourceUrl?: string;
}
const links = await readData<OwnershipLink[]>("reference/ownership-links.json");
const extraEdges: GraphEdge[] = links.map((l) => ({
  from: nodeIdFor(l.from.name, GraphNodeTypeSchema.parse(l.from.type)),
  to: nodeIdFor(l.to.name, GraphNodeTypeSchema.parse(l.to.type)),
  type: GraphEdgeTypeSchema.parse(l.type),
  note: l.note,
  sourceUrl: l.sourceUrl,
}));

const graph = buildGraph(baselines, extraEdges);
const riskIds = riskNodeIds(graph, entries);

console.log(
  `Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${riskIds.size} risk-bearing node(s).`,
);

// Accumulate every graph-derived signal per entity (slug), then write one file.
const byEntity = new Map<string, Signal[]>();
const add = (signals: Signal[]) => {
  for (const s of signals) {
    if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
    byEntity.get(s.entityId)!.push(s);
  }
};

// Proposal 3 — standing 1st/2nd-degree exposure.
for (const baseline of baselines) add(graphRiskSignals(baseline, graph, riskIds, asOf));

// Proposal 5 — a direct (1-hop) sanctioned owner is a confirmed ownership drift;
// propagate a re-trigger onto the confirmed entity's customer neighbours.
for (const baseline of baselines) {
  const nodeId = nodeIdFor(baseline.name, "entity");
  const sanctioned = neighbors(graph, nodeId)
    .map((n) => riskIds.get(n.id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
    .sort((a, b) => b.confidence - a.confidence);
  if (sanctioned.length === 0) continue; // not a confirmed source.
  console.log(`\nConfirmed drift on ${baseline.entityId} (direct sanctioned owner) → propagating…`);
  add(
    propagateConfirmedDrift(graph, nodeId, asOf, {
      baseConfidence: sanctioned[0]!.confidence,
      originSourceUrl: sanctioned[0]!.sourceUrl,
    }),
  );
}

let total = 0;
for (const [entityId, signals] of [...byEntity.entries()].sort()) {
  signals.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const out = await writeData(`signals/${entityId}.graph.json`, signals);
  total += signals.length;
  console.log(`\n${entityId}: ${signals.length} graph signal(s) → ${out}`);
  for (const s of signals) {
    console.log(`  • [${s.type}] ${s.title} (confidence ${s.confidence.toFixed(2)})`);
  }
}

console.log(`\n${total} graph signal(s) emitted across the book.`);
