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
import { buildGraph, nodeIdFor } from "@kyc/core/graph";
import { graphRiskSignals, riskNodeIds } from "@kyc/core/pipeline";
import { SanctionsEntrySchema } from "@kyc/core/connectors";
import { readData, repoRoot, writeData } from "./lib/repo.ts";

/**
 * Offline graph pass (proposal 3): build the relationship graph from the whole
 * book + a registry-style ownership-links reference, mark the risk-bearing nodes
 * (sanctioned people/vehicles, high-risk countries) and emit `ownership`
 * graph-exposure Signals for the entities that reach risk through a chain. Writes
 * data/signals/<entityId>.graph.json, which the live app loads like any source.
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

let total = 0;
for (const baseline of baselines) {
  const signals: Signal[] = graphRiskSignals(baseline, graph, riskIds, asOf);
  if (signals.length === 0) continue;
  const out = await writeData(`signals/${baseline.entityId}.graph.json`, signals);
  total += signals.length;
  console.log(`\n${baseline.entityId}: ${signals.length} graph signal(s) → ${out}`);
  for (const s of signals) console.log(`  • ${s.title} (confidence ${s.confidence.toFixed(2)})`);
}

console.log(`\n${total} graph signal(s) emitted across the book.`);
