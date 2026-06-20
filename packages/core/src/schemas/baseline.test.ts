import { describe, expect, it } from "vitest";
import { BeneficialOwnerSchema, KYCBaselineSchema } from "./baseline.ts";

describe("BeneficialOwnerSchema.nationality", () => {
  it("accepts an owner with an ISO alpha-2 nationality", () => {
    const owner = BeneficialOwnerSchema.parse({ name: "Jane Doe", nationality: "IR" });
    expect(owner.nationality).toBe("IR");
  });

  it("stays valid without a nationality (back-compat)", () => {
    const owner = BeneficialOwnerSchema.parse({ name: "Jane Doe" });
    expect(owner.nationality).toBeUndefined();
  });

  it("rejects a non-two-letter nationality", () => {
    expect(() => BeneficialOwnerSchema.parse({ name: "X", nationality: "Iran" })).toThrow();
  });

  it("still parses a minimal existing baseline shape", () => {
    const b = KYCBaselineSchema.parse({
      entityId: "e1",
      name: "E1",
      jurisdiction: "CH",
      businessModel: "x",
      riskRating: "low",
      onboardedAt: "2020-01-01",
    });
    expect(b.beneficialOwners).toEqual([]);
  });
});
