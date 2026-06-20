import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SanctionsEntrySchema } from "./opensanctions.ts";

// packages/core/src/connectors → repo root is four levels up.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const fixturePath = join(repoRoot, "data", "reference", "sanctions-sample.json");

describe("sanctions-sample.json", () => {
  it("parses as an array of SanctionsEntry", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const entries = z.array(SanctionsEntrySchema).parse(raw);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("contains the modelled sanctioned controller used by the demo", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const entries = z.array(SanctionsEntrySchema).parse(raw);
    expect(entries.some((e) => e.name === "Viktor Petrov")).toBe(true);
  });
});
