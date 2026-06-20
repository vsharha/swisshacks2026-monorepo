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
});

describe("recencyWeight", () => {
  it("is 1 at asOf and decays toward 0 with age", () => {
    expect(recencyWeight("2026-01-01", "2026-01-01")).toBe(1);
    const oneYear = recencyWeight("2025-01-01", "2026-01-01");
    expect(oneYear).toBeGreaterThan(0.45);
    expect(oneYear).toBeLessThan(0.55); // ~0.5 at the 365-day half-life
  });
});
