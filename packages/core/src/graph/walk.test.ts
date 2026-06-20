import { describe, expect, it } from "vitest";
import { buildGraph } from "./build.ts";
import { connectedEntities, findPaths, neighbors } from "./walk.ts";
import type { KYCBaseline } from "../schemas/index.ts";

function baseline(overrides: Partial<KYCBaseline>): KYCBaseline {
  return {
    entityId: "e",
    name: "E",
    aliases: [],
    jurisdiction: "CH",
    businessModel: "x",
    beneficialOwners: [],
    riskRating: "low",
    onboardedAt: "2020-01-01",
    ...overrides,
  };
}

// A Ltd → Caspian Ltd (CONTROLS), Caspian → Hidden Boss (external CONTROLS).
// So Hidden Boss is reachable from A Ltd at two hops.
const graph = buildGraph(
  [
    baseline({ entityId: "a", name: "A Ltd", beneficialOwners: [{ name: "Caspian Ltd", role: "Parent" }] }),
    baseline({ entityId: "b", name: "B Ltd", beneficialOwners: [{ name: "Hidden Boss" }] }),
  ],
  [{ from: "person:hidden boss", to: "org:caspian ltd", type: "CONTROLS", sourceUrl: "https://reg.example/x" }],
);

describe("neighbors", () => {
  it("returns edges touching a node in both directions", () => {
    const ids = neighbors(graph, "org:caspian ltd").map((n) => n.id).sort();
    expect(ids).toContain("org:a ltd");
    expect(ids).toContain("person:hidden boss");
  });
});

describe("findPaths", () => {
  it("finds the two-hop chain from A Ltd to the hidden controller", () => {
    const paths = findPaths(graph, "org:a ltd", (n) => n.id === "person:hidden boss");
    expect(paths).toHaveLength(1);
    expect(paths[0]!.nodes.map((n) => n.id)).toEqual([
      "org:a ltd",
      "org:caspian ltd",
      "person:hidden boss",
    ]);
    expect(paths[0]!.edges).toHaveLength(2);
  });

  it("respects maxDepth", () => {
    expect(findPaths(graph, "org:a ltd", (n) => n.id === "person:hidden boss", 1)).toEqual([]);
  });

  it("returns nothing when no node matches", () => {
    expect(findPaths(graph, "org:a ltd", (n) => n.id === "person:nobody")).toEqual([]);
  });
});

describe("connectedEntities", () => {
  it("reaches B Ltd from A Ltd through the shared controller chain", () => {
    const reached = connectedEntities(graph, "org:a ltd", 3).map((r) => r.entityId);
    expect(reached).toContain("org:b ltd");
  });
});
