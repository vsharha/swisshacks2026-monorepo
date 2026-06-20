import { sourceQuality } from "../drift/confidence.ts";
import { connectedEntities } from "../graph/walk.ts";
import {
  SignalSchema,
  type RiskGraph,
  type Signal,
} from "../schemas/index.ts";

/**
 * Risk propagation as a re-trigger (proposal 5). When Stage 2/3 *confirms* a
 * drift on one entity, that confirmed drift becomes a trigger: this function
 * walks the relationship graph to the confirmed entity's customer neighbours and
 * emits a cheap `ownership` re-trigger `Signal` on each, so risk on a shared
 * controller moves every entity that controller touches — even one with no news
 * of its own. The signals feed ordinary Stage-1 re-scoring; only a neighbour
 * that itself crosses a threshold escalates, so propagation stays near-free.
 *
 * It is the runtime complement to the static graph-risk enricher (proposal 3):
 * the enricher answers "what risk can this entity reach?"; propagation answers
 * "now that A is confirmed, who inherits it?". `confirmedEntityId` is a graph
 * node id (`org:<name>`); only neighbours that are customers in the book (their
 * `entity` node carries an `entityId`) receive a signal.
 */

export interface PropagateOptions {
  /** Confidence at the source of the propagation (e.g. the confirmed composite). */
  baseConfidence?: number;
  /** How far risk propagates along the graph. */
  maxDepth?: number;
  /** Citation for the propagated signal — the evidence that confirmed the source. */
  originSourceUrl?: string;
}

/** Per-hop confidence decay for propagated risk. */
const HOP_DECAY = 0.6;

/** Fallback citation when the caller does not supply the confirming evidence. */
const DEFAULT_ORIGIN_URL = "https://www.opensanctions.org/";

export function propagateConfirmedDrift(
  graph: RiskGraph,
  confirmedEntityId: string,
  asOf: string,
  opts: PropagateOptions = {},
): Signal[] {
  const baseConfidence = opts.baseConfidence ?? sourceQuality("graph");
  const maxDepth = opts.maxDepth ?? 2;
  const originSourceUrl = opts.originSourceUrl ?? DEFAULT_ORIGIN_URL;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const fromLabel = byId.get(confirmedEntityId)?.label ?? confirmedEntityId;

  const signals: Signal[] = [];
  for (const reached of connectedEntities(graph, confirmedEntityId, maxDepth)) {
    const node = byId.get(reached.entityId);
    if (!node?.entityId) continue; // only propagate onto customers in the book.

    const hops = reached.path.edges.length;
    const confidence = baseConfidence * HOP_DECAY ** (hops - 1);
    const via = reached.path.nodes
      .slice(1, -1)
      .map((n) => n.label)
      .join(" → ");
    signals.push(
      SignalSchema.parse({
        id: `graph-prop-${node.entityId}-from-${confirmedEntityId.replace(/[^a-z0-9]+/gi, "-")}`,
        entityId: node.entityId,
        axis: "ownership",
        type: "propagated_risk",
        date: asOf,
        sourceUrl: originSourceUrl,
        title:
          `Risk propagated to ${node.label} from a confirmed drift on ${fromLabel}` +
          (via ? ` via ${via}` : "") +
          ` (${hops} hops).`,
        source: "graph",
        payload: { path: reached.path, hops, from: confirmedEntityId },
        confidence,
      }),
    );
  }
  return signals;
}
