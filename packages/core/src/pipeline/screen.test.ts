import { describe, expect, it } from "vitest";
import { screenEntity } from "./screen.ts";
import { SanctionsEntrySchema, type SanctionsEntry } from "../connectors/opensanctions.ts";
import type { KYCBaseline } from "../schemas/index.ts";

const entries: SanctionsEntry[] = [
  SanctionsEntrySchema.parse({
    name: "Viktor Petrov",
    list: "OFAC SDN",
    type: "sanction",
    country: "RU",
    sourceUrl: "https://sanctions.example/petrov",
  }),
  SanctionsEntrySchema.parse({
    name: "Jane Minister",
    list: "PEP",
    type: "pep",
    sourceUrl: "https://pep.example/jane",
  }),
];

const base: KYCBaseline = {
  entityId: "e1",
  name: "Clean Co",
  aliases: [],
  jurisdiction: "AE",
  businessModel: "x",
  beneficialOwners: [],
  riskRating: "medium",
  onboardedAt: "2020-01-01",
};

describe("screenEntity", () => {
  it("emits an ownership signal for a sanctioned beneficial owner", () => {
    const out = screenEntity(
      { ...base, beneficialOwners: [{ name: "Viktor Petrov" }] },
      entries,
      "2026-06-20",
    );
    const ownership = out.filter((s) => s.axis === "ownership");
    expect(ownership).toHaveLength(1);
    expect(ownership[0]!.type).toBe("sanctioned_controller");
    expect(ownership[0]!.source).toBe("opensanctions");
    expect(ownership[0]!.date).toBe("2026-06-20");
  });

  it("emits a reputation signal for a PEP owner", () => {
    const out = screenEntity(
      { ...base, beneficialOwners: [{ name: "Jane Minister" }] },
      entries,
      "2026-06-20",
    );
    expect(out.some((s) => s.axis === "reputation" && s.type === "pep_individual")).toBe(true);
  });

  it("emits a jurisdiction signal for a high-risk owner nationality", () => {
    const out = screenEntity(
      { ...base, beneficialOwners: [{ name: "Clean Owner", nationality: "IR" }] },
      entries,
      "2026-06-20",
    );
    expect(out.some((s) => s.axis === "jurisdiction" && s.type === "owner_country_risk")).toBe(true);
  });

  it("emits a reputation signal when the entity name itself is sanctioned", () => {
    const out = screenEntity({ ...base, name: "Viktor Petrov" }, entries, "2026-06-20");
    expect(out.some((s) => s.axis === "reputation" && s.type === "sanctioned_entity")).toBe(true);
  });

  it("emits nothing for a clean entity", () => {
    const out = screenEntity(
      { ...base, beneficialOwners: [{ name: "Honest Owner", nationality: "CH" }] },
      entries,
      "2026-06-20",
    );
    expect(out).toEqual([]);
  });
});
