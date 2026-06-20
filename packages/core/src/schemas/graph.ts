import { z } from "zod";
import { Score } from "./common.ts";

/**
 * The relationship layer (proposal 3). Entities, the people and vehicles that
 * own or control them, and the countries they touch are **nodes**; ownership,
 * control, investment and board links are typed **edges**. Walking the graph
 * yields Nth-degree exposure and hidden-controller detection; the findings are
 * emitted as ordinary `Signal`s (see `pipeline/enrichers/graph.ts`), so the rest
 * of the cascade consumes them unchanged. Vocabulary from `datastructure.md`.
 */

/** Node kinds. This phase populates entity / individual / investor / country. */
export const GraphNodeTypeSchema = z.enum([
  "entity",
  "individual",
  "investor",
  "country",
  "wallet",
  "exchange",
  "regulator",
]);
export type GraphNodeType = z.infer<typeof GraphNodeTypeSchema>;

/** Typed relationships between nodes. */
export const GraphEdgeTypeSchema = z.enum([
  "OWNS",
  "CONTROLS",
  "INVESTED_IN",
  "PARTNERS_WITH",
  "OPERATES_IN",
  "TRANSACTS_WITH",
  "BOARD_MEMBER_OF",
]);
export type GraphEdgeType = z.infer<typeof GraphEdgeTypeSchema>;

export const GraphNodeSchema = z.object({
  /** Stable id, e.g. `org:gulf bridge capital ltd`, `person:viktor petrov`. */
  id: z.string().min(1),
  type: GraphNodeTypeSchema,
  /** Human-readable name for explainability. */
  label: z.string().min(1),
  /** ISO 3166-1 alpha-2, when the node carries a country (domicile/nationality). */
  country: z.string().optional(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: GraphEdgeTypeSchema,
  /** Optional edge weight in [0, 1] (e.g. ownership share). */
  weight: Score.optional(),
  /** Provenance note for externally-sourced (registry-style) edges. */
  note: z.string().optional(),
  /** Citation for edges that did not come from a baseline (e.g. a registry). */
  sourceUrl: z.url().optional(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const RiskGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});
export type RiskGraph = z.infer<typeof RiskGraphSchema>;

/**
 * An ordered relationship chain — the edge path that produced a graph-derived
 * risk (`entity → UBO → sanctioned party`). Attached to graph `Signal`s and,
 * via Stage 3, to the `Alert` as first-class, citable explainability. `nodes`
 * has one more element than `edges` (n nodes, n-1 hops).
 */
export const RelationshipPathSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        type: GraphNodeTypeSchema,
      }),
    )
    .min(2),
  edges: z.array(GraphEdgeTypeSchema),
});
export type RelationshipPath = z.infer<typeof RelationshipPathSchema>;
