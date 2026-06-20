import { z } from "zod";
import { type GraphEdge } from "../schemas/index.ts";
import { nodeIdFor } from "../graph/build.ts";

/**
 * GLEIF registry connector (proposal 12 §3): the LEI + corporate-relationship
 * registry of record. Its value to the cascade is **ownership structure** — the
 * parent/child consolidation links the baselines can't express on their own. So
 * it produces graph **edges** (the real source behind the hand-authored
 * `data/reference/ownership-links.json` seam `buildGraph` already accepts), letting
 * the proposal 3/5 walk reach hidden controllers. Deterministic transform + a
 * sample fixture; the live `fetchGleifRelationships` is a documented scaffold.
 */

export const GleifRelationshipSchema = z.object({
  childName: z.string().min(1),
  childLei: z.string().optional(),
  parentName: z.string().min(1),
  parentLei: z.string().optional(),
  relationshipType: z.enum(["IS_DIRECTLY_CONSOLIDATED_BY", "IS_ULTIMATELY_CONSOLIDATED_BY"]),
  sourceUrl: z.url(),
});
export type GleifRelationship = z.infer<typeof GleifRelationshipSchema>;

/**
 * Map GLEIF consolidation relationships to graph control edges (parent CONTROLS
 * child), ready to pass to `buildGraph(baselines, extraEdges)`. Org names resolve
 * to the same `org:` node ids the baselines produce, so a registry-sourced parent
 * connects to a customer node automatically.
 */
export function gleifToOwnershipEdges(records: GleifRelationship[]): GraphEdge[] {
  return records.map((r) => ({
    from: nodeIdFor(r.parentName, "entity"),
    to: nodeIdFor(r.childName, "entity"),
    type: "CONTROLS",
    note: `GLEIF ${r.relationshipType}${r.parentLei ? ` (LEI ${r.parentLei})` : ""}`,
    sourceUrl: r.sourceUrl,
  }));
}

export interface FetchGleifParams {
  apiKey?: string;
  lei: string;
}

/**
 * Live GLEIF relationship fetch — scaffold. The public LEI API needs no key, but
 * wiring it live is deferred; with no key this logs and returns [], so the demo
 * runs off the bundled fixture.
 */
export async function fetchGleifRelationships(params: FetchGleifParams): Promise<GleifRelationship[]> {
  if (!params.apiKey) {
    console.warn("[gleif] live LEI fetch not wired — set GLEIF_API or use the fixture; returning []");
    return [];
  }
  console.warn("[gleif] live LEI fetch not implemented yet (proposal 12); returning []");
  return [];
}
