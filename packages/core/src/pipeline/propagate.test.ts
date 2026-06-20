import { describe, expect, it } from "vitest";
import { propagateConfirmedDrift } from "./propagate.ts";
import { buildGraph } from "../graph/build.ts";
import { nodeIdFor } from "../graph/build.ts";
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

// Gulf and Nord share controller Viktor Petrov (Gulf direct; Nord via Caspian).
const graph = buildGraph(
  [
    baseline({ entityId: "gulf", name: "Gulf Bridge Ltd", beneficialOwners: [{ name: "Viktor Petrov", share: 0.4 }] }),
    baseline({ entityId: "nord", name: "NordTrade Ltd", beneficialOwners: [{ name: "Caspian Ltd", role: "Parent" }] }),
  ],
  [{ from: "person:viktor petrov", to: "org:caspian ltd", type: "CONTROLS", sourceUrl: "https://reg.example/x" }],
);

describe("propagateConfirmedDrift", () => {
  it("emits a re-trigger signal on a connected customer entity", () => {
    const out = propagateConfirmedDrift(graph, nodeIdFor("Gulf Bridge Ltd", "entity"), "2026-06-20");
    const nord = out.find((s) => s.entityId === "nord");
    expect(nord).toBeDefined();
    expect(nord!.axis).toBe("ownership");
    expect(nord!.type).toBe("propagated_risk");
    expect(nord!.source).toBe("graph");
    expect(nord!.confidence).toBeGreaterThan(0);
    expect(nord!.confidence).toBeLessThanOrEqual(1);
  });

  it("never emits a signal back onto the confirmed entity itself", () => {
    const out = propagateConfirmedDrift(graph, nodeIdFor("Gulf Bridge Ltd", "entity"), "2026-06-20");
    expect(out.some((s) => s.entityId === "gulf")).toBe(false);
  });

  it("returns nothing for an isolated entity", () => {
    const isolated = buildGraph([baseline({ entityId: "solo", name: "Solo Ltd" })]);
    expect(propagateConfirmedDrift(isolated, nodeIdFor("Solo Ltd", "entity"), "2026-06-20")).toEqual([]);
  });
});
