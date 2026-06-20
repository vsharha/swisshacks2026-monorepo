import { describe, expect, it } from "vitest";
import { scoreAxis } from "./score.ts";
import { confidenceForAxis } from "./confidence.ts";
import type { Signal } from "../schemas/index.ts";

const base: Signal = {
  id: "s1",
  entityId: "e1",
  axis: "reputation",
  type: "adverse_media",
  date: "2026-01-01",
  sourceUrl: "https://example.com/a",
  title: "headline",
  source: "eventregistry",
  payload: {},
  confidence: 0.6,
};

describe("scoreAxis", () => {
  it("returns the weighted-blend confidence, not the max signal confidence", () => {
    const signals = [base, { ...base, id: "s2", source: "sec_edgar" as const }];
    const result = scoreAxis(signals, "2026-01-01");
    expect(result.confidence).toBeCloseTo(confidenceForAxis(signals, "2026-01-01"), 10);
  });

  it("keeps an empty axis at zero", () => {
    const result = scoreAxis([], "2026-01-01");
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.status).toBe("stable");
  });
});
