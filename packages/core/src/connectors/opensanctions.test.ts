import { describe, expect, it } from "vitest";
import { matchSanctions, SanctionsEntrySchema, type SanctionsEntry } from "./opensanctions.ts";

const entries: SanctionsEntry[] = [
  SanctionsEntrySchema.parse({
    name: "Viktor Petrov",
    aliases: ["V. Petrov"],
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

describe("matchSanctions", () => {
  it("matches on the canonical name, case- and space-insensitively", () => {
    expect(matchSanctions("  viktor   petrov ", entries)?.list).toBe("OFAC SDN");
  });

  it("matches on an alias", () => {
    expect(matchSanctions("v. petrov", entries)?.type).toBe("sanction");
  });

  it("returns null for a clean name", () => {
    expect(matchSanctions("Honest Citizen", entries)).toBeNull();
  });
});
