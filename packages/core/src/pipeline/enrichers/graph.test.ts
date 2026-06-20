import { describe, expect, it } from "vitest";
import { graphRiskSignals, riskNodeIds } from "./graph.ts";
import { buildGraph } from "../../graph/build.ts";
import { SanctionsEntrySchema, type SanctionsEntry } from "../../connectors/opensanctions.ts";
import type { KYCBaseline } from "../../schemas/index.ts";

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

const entries: SanctionsEntry[] = [
  SanctionsEntrySchema.parse({
    name: "Viktor Petrov",
    list: "OFAC SDN",
    type: "sanction",
    country: "RU",
    sourceUrl: "https://sanctions.example/petrov",
  }),
];

// direct: Viktor Petrov directly owns Gulf Bridge (1 hop).
// hidden: NordTrade → Caspian Ltd → Viktor Petrov (2 hops, via external link).
const baselines = [
  baseline({ entityId: "gulf", name: "Gulf Bridge Ltd", beneficialOwners: [{ name: "Viktor Petrov", share: 0.4 }] }),
  baseline({ entityId: "nord", name: "NordTrade Ltd", beneficialOwners: [{ name: "Caspian Ltd", role: "Parent" }] }),
];
const graph = buildGraph(baselines, [
  { from: "person:viktor petrov", to: "org:caspian ltd", type: "CONTROLS", sourceUrl: "https://reg.example/x" },
]);
const riskIds = riskNodeIds(graph, entries);

describe("riskNodeIds", () => {
  it("marks the sanctioned individual node", () => {
    expect(riskIds.has("person:viktor petrov")).toBe(true);
    expect(riskIds.get("person:viktor petrov")?.sourceUrl).toBe("https://sanctions.example/petrov");
  });
});

describe("graphRiskSignals", () => {
  it("emits an ownership signal for a hidden controller reached through a chain", () => {
    const out = graphRiskSignals(baselines[1]!, graph, riskIds, "2026-06-20");
    expect(out).toHaveLength(1);
    const s = out[0]!;
    expect(s.axis).toBe("ownership");
    expect(s.source).toBe("graph");
    expect(s.type).toBe("graph_exposure");
    expect(s.entityId).toBe("nord");
    expect(s.confidence).toBeLessThan(0.97); // decayed below the direct list prior
    expect(Array.isArray((s.payload as { path?: { edges: string[] } }).path?.edges)).toBe(true);
  });

  it("does not emit for a directly-sanctioned owner (one hop — screen's job)", () => {
    expect(graphRiskSignals(baselines[0]!, graph, riskIds, "2026-06-20")).toEqual([]);
  });
});
