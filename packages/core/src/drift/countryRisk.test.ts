import { describe, expect, it } from "vitest";
import { countryRisk } from "./countryRisk.ts";

describe("countryRisk", () => {
  it("flags a high-risk jurisdiction", () => {
    expect(countryRisk("IR").level).toBe("high");
  });

  it("is case-insensitive on the code", () => {
    expect(countryRisk("ir").level).toBe("high");
  });

  it("returns standard for an unlisted country", () => {
    const r = countryRisk("CH");
    expect(r.level).toBe("standard");
    expect(r.reason).toBeTruthy();
  });
});
