import { describe, expect, it } from "vitest";
import { countryRiskSignals } from "./geo.ts";
import type { KYCBaseline } from "../../schemas/index.ts";

const base: KYCBaseline = {
  entityId: "e1",
  name: "E1",
  aliases: [],
  jurisdiction: "CH",
  businessModel: "x",
  beneficialOwners: [],
  riskRating: "low",
  onboardedAt: "2020-01-01",
};

describe("countryRiskSignals", () => {
  it("emits a jurisdiction signal for a high-risk domicile", () => {
    const signals = countryRiskSignals({ ...base, jurisdiction: "IR" }, "2026-06-20");
    expect(signals).toHaveLength(1);
    expect(signals[0]!.axis).toBe("jurisdiction");
    expect(signals[0]!.source).toBe("regulator");
    expect(signals[0]!.date).toBe("2026-06-20");
    expect(signals[0]!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("emits nothing for a standard domicile", () => {
    expect(countryRiskSignals({ ...base, jurisdiction: "CH" }, "2026-06-20")).toEqual([]);
  });
});
