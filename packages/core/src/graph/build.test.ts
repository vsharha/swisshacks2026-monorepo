import { describe, expect, it } from "vitest";
import { buildGraph, nodeIdFor } from "./build.ts";
import type { GraphEdge } from "../schemas/index.ts";
import type { KYCBaseline } from "../schemas/index.ts";

function baseline(overrides: Partial<KYCBaseline>): KYCBaseline {
  return {
    entityId: "e1",
    name: "E1 Ltd",
    aliases: [],
    jurisdiction: "CH",
    businessModel: "x",
    beneficialOwners: [],
    riskRating: "low",
    onboardedAt: "2020-01-01",
    ...overrides,
  };
}

describe("nodeIdFor", () => {
  it("namespaces and normalizes by type", () => {
    expect(nodeIdFor("Viktor  Petrov", "individual")).toBe("person:viktor petrov");
    expect(nodeIdFor("Caspian Holdings Ltd", "entity")).toBe("org:caspian holdings ltd");
    expect(nodeIdFor("AE", "country")).toBe("country:ae");
  });
});

describe("buildGraph", () => {
  it("creates an entity node and an OPERATES_IN edge to its jurisdiction", () => {
    const g = buildGraph([baseline({})]);
    expect(g.nodes.find((n) => n.id === "org:e1 ltd")?.type).toBe("entity");
    expect(g.edges.some((e) => e.to === "country:ch" && e.type === "OPERATES_IN")).toBe(true);
  });

  it("derives the edge type from the owner role/share", () => {
    const g = buildGraph([
      baseline({
        beneficialOwners: [
          { name: "Jane Chair", role: "Chairman" },
          { name: "Big Parent SA", role: "Parent", share: 1 },
          { name: "Vic Investor", role: "Investor", share: 0.2 },
          { name: "Plain Owner", share: 0.3 },
        ],
      }),
    ]);
    const edgeTo = (from: string) => g.edges.find((e) => e.from === from && e.to === "org:e1 ltd")?.type;
    expect(edgeTo("person:jane chair")).toBe("BOARD_MEMBER_OF");
    expect(edgeTo("org:big parent sa")).toBe("CONTROLS");
    expect(edgeTo("person:vic investor")).toBe("INVESTED_IN");
    expect(edgeTo("person:plain owner")).toBe("OWNS");
  });

  it("connects two entities through a shared owner node", () => {
    const g = buildGraph([
      baseline({ entityId: "a", name: "A Ltd", beneficialOwners: [{ name: "Shared Person" }] }),
      baseline({ entityId: "b", name: "B Ltd", beneficialOwners: [{ name: "Shared Person" }] }),
    ]);
    const shared = g.nodes.filter((n) => n.id === "person:shared person");
    expect(shared).toHaveLength(1);
    expect(g.edges.filter((e) => e.from === "person:shared person")).toHaveLength(2);
  });

  it("merges external edges and creates placeholder nodes for unknown ids", () => {
    const extra: GraphEdge[] = [
      { from: "person:hidden boss", to: "org:e1 ltd", type: "CONTROLS", sourceUrl: "https://reg.example/x" },
    ];
    const g = buildGraph([baseline({})], extra);
    expect(g.nodes.find((n) => n.id === "person:hidden boss")?.type).toBe("individual");
    expect(g.edges.some((e) => e.from === "person:hidden boss" && e.note === undefined)).toBe(true);
  });
});
