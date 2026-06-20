import { matchSanctions, type SanctionsEntry } from "../../connectors/opensanctions.ts";
import { sourceQuality } from "../../drift/confidence.ts";
import { countryRisk, FATF_REFERENCE_URL } from "../../drift/countryRisk.ts";
import { nodeIdFor } from "../../graph/build.ts";
import { findPaths } from "../../graph/walk.ts";
import {
  SignalSchema,
  type KYCBaseline,
  type RiskGraph,
  type Signal,
} from "../../schemas/index.ts";

/**
 * Graph-risk enricher (proposal 3): walk the relationship graph from the entity
 * to any node that *bears* risk (a sanctioned person/vehicle, a high-risk
 * country) and, when the risk is reached through a **chain** (≥2 hops), emit an
 * `ownership` `Signal` carrying the relationship path. One-hop reach is the
 * static screen's job (proposal 6) — this enricher exists for the indirect,
 * hidden-controller case the screen cannot see. Output is a normal `Signal`, so
 * Stage 0/1/2/3 consume it unchanged.
 */

/** What a risk-bearing node contributes to a graph signal. */
export interface RiskOrigin {
  sourceUrl: string;
  title: string;
  confidence: number;
}

/** Per-hop confidence decay for graph-derived reach. */
const HOP_DECAY = 0.6;

/** Skip a graph signal when a chain ends up below this confidence. */
const MIN_CONFIDENCE = 0.1;

/** A short, id-safe slug for a graph node id. */
function slug(nodeId: string): string {
  return nodeId.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

/**
 * Risk-bearing nodes in the graph, keyed by node id: sanctioned/PEP people and
 * vehicles (matched against `entries`), and high-risk countries. The map value
 * is the origin to cite when risk reaches an entity through this node.
 */
export function riskNodeIds(graph: RiskGraph, entries: SanctionsEntry[]): Map<string, RiskOrigin> {
  const risks = new Map<string, RiskOrigin>();
  for (const node of graph.nodes) {
    if (node.type === "country") {
      const code = node.country ?? node.label;
      const risk = countryRisk(code);
      if (risk.level !== "standard") {
        risks.set(node.id, {
          sourceUrl: FATF_REFERENCE_URL,
          title: `${code} is a ${risk.level}-risk jurisdiction: ${risk.reason}`,
          confidence: sourceQuality("regulator"),
        });
      }
      continue;
    }
    const hit = matchSanctions(node.label, entries);
    if (hit) {
      risks.set(node.id, {
        sourceUrl: hit.sourceUrl,
        title: `${node.label} matches ${hit.list} (${hit.type})`,
        confidence: sourceQuality("opensanctions"),
      });
    }
  }
  return risks;
}

export function graphRiskSignals(
  baseline: KYCBaseline,
  graph: RiskGraph,
  riskIds: Map<string, RiskOrigin>,
  asOf: string,
): Signal[] {
  const startId = nodeIdFor(baseline.name, "entity");
  const paths = findPaths(graph, startId, (n) => riskIds.has(n.id));

  const signals: Signal[] = [];
  for (const path of paths) {
    const hops = path.edges.length;
    if (hops < 2) continue; // 1-hop direct reach is the static screen's job.
    const target = path.nodes[path.nodes.length - 1]!;
    const origin = riskIds.get(target.id);
    if (!origin) continue;

    const confidence = origin.confidence * HOP_DECAY ** (hops - 1);
    if (confidence < MIN_CONFIDENCE) continue;

    const via = path.nodes
      .slice(1, -1)
      .map((n) => n.label)
      .join(" → ");
    signals.push(
      SignalSchema.parse({
        id: `graph-${baseline.entityId}-${slug(target.id)}`,
        entityId: baseline.entityId,
        axis: "ownership",
        type: "graph_exposure",
        date: asOf,
        sourceUrl: origin.sourceUrl,
        title: `Risk reaches ${baseline.name} through ${via} (${hops} hops): ${origin.title}.`,
        source: "graph",
        payload: { path, hops, origin: origin.title },
        confidence,
      }),
    );
  }
  return signals;
}
