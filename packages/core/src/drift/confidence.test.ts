import { describe, expect, it } from "vitest";
import { SourceSchema } from "../schemas/index.ts";
import { SOURCE_QUALITY, recencyWeight, sourceQuality } from "./confidence.ts";

describe("SOURCE_QUALITY", () => {
  it("has a prior for every Source enum value", () => {
    for (const source of SourceSchema.options) {
      expect(SOURCE_QUALITY[source]).toBeGreaterThan(0);
      expect(SOURCE_QUALITY[source]).toBeLessThanOrEqual(1);
    }
  });

  it("ranks regulator-grade sources above news and manual", () => {
    expect(sourceQuality("sec_edgar")).toBeGreaterThan(sourceQuality("eventregistry"));
    expect(sourceQuality("opensanctions")).toBeGreaterThan(sourceQuality("manual"));
  });

  it("includes the regulator source with a high prior", () => {
    expect(sourceQuality("regulator")).toBeGreaterThanOrEqual(0.9);
    expect(sourceQuality("regulator")).toBeLessThan(sourceQuality("opensanctions"));
  });

  it("scores graph inference below a primary list hit", () => {
    expect(sourceQuality("graph")).toBeCloseTo(0.7);
    expect(sourceQuality("graph")).toBeLessThan(sourceQuality("opensanctions"));
  });
});

describe("recencyWeight", () => {
  it("is 1 at asOf and decays toward 0 with age", () => {
    expect(recencyWeight("2026-01-01", "2026-01-01")).toBe(1);
    const oneYear = recencyWeight("2025-01-01", "2026-01-01");
    expect(oneYear).toBeGreaterThan(0.45);
    expect(oneYear).toBeLessThan(0.55); // ~0.5 at the 365-day half-life
  });
});

import { confidenceForAxis } from "./confidence.ts";
import type { Signal } from "../schemas/index.ts";

function sig(over: Partial<Signal>): Signal {
  return {
    id: "s1",
    entityId: "e1",
    axis: "reputation",
    type: "adverse_media",
    date: "2026-01-01",
    sourceUrl: "https://example.com/a",
    title: "t",
    source: "eventregistry",
    payload: {},
    confidence: 0.6,
    ...over,
  };
}

describe("confidenceForAxis", () => {
  it("is 0 for no signals", () => {
    expect(confidenceForAxis([], "2026-01-01")).toBe(0);
  });

  it("rises with independent corroboration from distinct sources", () => {
    const asOf = "2026-01-01";
    const one = confidenceForAxis([sig({ source: "eventregistry" })], asOf);
    const two = confidenceForAxis(
      [sig({ id: "a", source: "eventregistry" }), sig({ id: "b", source: "sec_edgar" })],
      asOf,
    );
    expect(two).toBeGreaterThan(one);
  });

  it("weights a regulator-grade source above a news source", () => {
    const asOf = "2026-01-01";
    const news = confidenceForAxis([sig({ source: "eventregistry" })], asOf);
    const reg = confidenceForAxis([sig({ source: "sec_edgar" })], asOf);
    expect(reg).toBeGreaterThan(news);
  });
});
