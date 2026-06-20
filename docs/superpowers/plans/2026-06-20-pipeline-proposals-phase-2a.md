# Pipeline Proposals — Phase 2a (Enrichers + Static Screening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic country-risk + sanctions/PEP screening that emits canonical `Signal`s on the `jurisdiction`/`ownership`/`reputation` axes (proposals 4 + 6), and a UAE demo entity (Gulf Bridge Capital) whose sanctioned-owner exposure lights up through the existing cascade.

**Architecture:** New pure functions in `@kyc/core` (country-risk reference, a sanctions matcher + connector scaffold, geo/screen signal generators) that take a baseline + reference data and return validated `Signal[]`. An offline script runs them at baseline-build time and writes `data/signals/<entity>.screen.json`; the live app loads those signals exactly like EventRegistry/SEC signals (no live-path change — signals are signals). Crypto-grade `source: "regulator"`/`"opensanctions"` confidence flows through the Phase-1 confidence engine unchanged.

**Tech Stack:** TypeScript (ESM, `.ts` import specifiers), Zod v4, Vitest, pnpm workspaces.

## Global Constraints

- **Additive only.** Schema changes are limited to one optional field (`BeneficialOwner.nationality`) and one `SourceSchema` enum value (`regulator`). Existing `data/` fixtures must still parse.
- **`opensanctions` already exists in `SourceSchema`** (Phase 1 left it). Add **only** `regulator` this phase, with its `SOURCE_QUALITY` prior `0.92`. `opensanctions` already has prior `0.97`.
- **Core stays framework-agnostic:** screen/enricher functions take the baseline and the reference data (country list is bundled like `SOURCE_QUALITY`; the sanctions list is passed in as an argument). No `process.env` in core; no `fs` reads in core.
- **Tier-D scaffold convention (locked):** the `opensanctions` connector's live fetch, with no key, returns `[]` and logs `"set OPENSANCTIONS_API_KEY"`. The deterministic matcher + bundled sample fixture do the real work for the demo. Nothing fake-passes as a live fetch.
- **Every `Signal` needs a real `sourceUrl`** (schema requires `z.url()`). Enricher/screen signals cite a stable reference URL (FATF page; the sanctions entry's `sourceUrl`).
- **Risk and confidence stay separate** (confidence via the Phase-1 engine).
- **Commit style (AGENTS.md):** commit as the user; short title only; **NO description block and NO co-author trailer**. Do not stage the pre-existing modified `.claude/settings.json`.
- **Before each commit, when code changed:** `pnpm check`, then `pnpm fix`, then `pnpm lint`.
- **Date determinism:** signal generators take an explicit `asOf: string` used as the signal `date`, so tests and the script are deterministic (no `new Date()` in core logic under test).

## Interfaces produced by this plan (cross-task contract)

- `BeneficialOwnerSchema` gains `nationality?: string` (ISO 3166-1 alpha-2).
- `SourceSchema` gains `"regulator"`; `SOURCE_QUALITY.regulator = 0.92`.
- `@kyc/core/drift`: `CountryRiskLevel`, `CountryRisk`, `COUNTRY_RISK`, `countryRisk(code: string): CountryRisk`.
- `@kyc/core/connectors`: `SanctionsEntry`, `SanctionsEntrySchema`, `matchSanctions(name, entries): SanctionsEntry | null`, `fetchSanctions(params): Promise<SanctionsEntry[]>`.
- `@kyc/core/pipeline`: `countryRiskSignals(baseline, asOf): Signal[]`, `screenEntity(baseline, entries, asOf): Signal[]`.
- `@kyc/web` `loadBook` loads all `data/signals/<entityId>.*.json` files (not just `eventregistry`/`sec`).

---

### Task 1: Add optional `nationality` to BeneficialOwner

**Files:**
- Modify: `packages/core/src/schemas/baseline.ts`
- Create: `packages/core/src/schemas/baseline.test.ts`

**Interfaces:**
- Produces: `BeneficialOwner.nationality?: string` consumed by Task 7 (`screenEntity`).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/schemas/baseline.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test baseline`
Expected: FAIL — the `nationality: "IR"` case fails because the field is stripped/unknown handling, or the `"Iran"` reject case fails (no validation yet).

- [ ] **Step 3: Add the field**

In `packages/core/src/schemas/baseline.ts`, change `BeneficialOwnerSchema`:
```ts
export const BeneficialOwnerSchema = z.object({
  name: z.string().min(1),
  /** Ownership fraction in [0, 1], when known. */
  share: Score.optional(),
  role: z.string().optional(),
  /** Country of origin — ISO 3166-1 alpha-2 (e.g. "IR"), when known. */
  nationality: z
    .string()
    .regex(/^[A-Z]{2}$/, "nationality must be an ISO 3166-1 alpha-2 code")
    .optional(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test baseline`
Expected: PASS (4/4).

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
```bash
git add packages/core/src/schemas/baseline.ts packages/core/src/schemas/baseline.test.ts
git commit -m "Add optional nationality to beneficial owner schema"
```

---

### Task 2: Add `regulator` source + its confidence prior

**Files:**
- Modify: `packages/core/src/schemas/common.ts`
- Modify: `packages/core/src/drift/confidence.ts`
- Modify: `packages/core/src/drift/confidence.test.ts`

**Interfaces:**
- Produces: `Source` includes `"regulator"`; `SOURCE_QUALITY.regulator = 0.92` — consumed by Tasks 4 + 7.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/drift/confidence.test.ts` (inside the existing `describe("SOURCE_QUALITY", ...)` is fine, or add a new `it`):
```ts
it("includes the regulator source with a high prior", () => {
  expect(sourceQuality("regulator")).toBeGreaterThanOrEqual(0.9);
  expect(sourceQuality("regulator")).toBeLessThan(sourceQuality("opensanctions"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test confidence`
Expected: FAIL — `"regulator"` is not assignable to `Source` (type error) / no prior.

- [ ] **Step 3: Add the enum value and prior**

In `packages/core/src/schemas/common.ts`, add to `SourceSchema` (after `gleif`):
```ts
  "regulator",
```
so the enum reads:
```ts
export const SourceSchema = z.enum([
  "eventregistry",
  "sec_edgar",
  "wayback",
  "opensanctions",
  "gleif",
  "regulator",
  "opencorporates",
  "manual",
]);
```

In `packages/core/src/drift/confidence.ts`, add to `SOURCE_QUALITY` (keep it covering exactly the enum):
```ts
  regulator: 0.92,
```
(place it after `gleif: 0.95,` so the map stays readable).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test confidence`
Expected: PASS. The existing "has a prior for every Source enum value" test now also covers `regulator`.

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
```bash
git add packages/core/src/schemas/common.ts packages/core/src/drift/confidence.ts packages/core/src/drift/confidence.test.ts
git commit -m "Add regulator source with its confidence prior"
```

---

### Task 3: Country-risk reference + lookup

**Files:**
- Create: `packages/core/src/drift/countryRisk.ts`
- Create: `packages/core/src/drift/countryRisk.test.ts`
- Modify: `packages/core/src/drift/index.ts`

**Interfaces:**
- Produces: `CountryRiskLevel`, `CountryRisk`, `COUNTRY_RISK`, `countryRisk(code)`, `FATF_REFERENCE_URL` — consumed by Tasks 4 + 7.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/drift/countryRisk.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test countryRisk`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/drift/countryRisk.ts`:
```ts
/**
 * Country-risk reference (proposal 4): a small, bundled list modelled on the
 * FATF "high-risk jurisdictions subject to a call for action" (black list) and
 * "jurisdictions under increased monitoring" (grey list). Bundled as a const —
 * like SOURCE_QUALITY — so the deterministic enrichers stay pure and testable.
 * This is a sample for the demo, not an authoritative live FATF feed (that is
 * proposal 12's regulator connector); unlisted countries are `standard`.
 */
export type CountryRiskLevel = "high" | "increased" | "standard";

export interface CountryRisk {
  level: CountryRiskLevel;
  reason: string;
}

/** Citation target for country-risk signals. */
export const FATF_REFERENCE_URL =
  "https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html";

/** ISO 3166-1 alpha-2 → risk. Keys are uppercase. */
export const COUNTRY_RISK: Record<string, CountryRisk> = {
  IR: { level: "high", reason: "FATF call-for-action (black list)." },
  KP: { level: "high", reason: "FATF call-for-action (black list)." },
  MM: { level: "high", reason: "FATF call-for-action (black list)." },
  SY: { level: "increased", reason: "FATF increased monitoring (grey list)." },
  YE: { level: "increased", reason: "FATF increased monitoring (grey list)." },
};

/** Risk for an ISO alpha-2 country code; `standard` if unlisted. */
export function countryRisk(code: string): CountryRisk {
  return (
    COUNTRY_RISK[code.toUpperCase()] ?? {
      level: "standard",
      reason: "Not on the modelled FATF high-risk / increased-monitoring lists.",
    }
  );
}
```

Add to `packages/core/src/drift/index.ts`:
```ts
export * from "./countryRisk.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test countryRisk`
Expected: PASS (3/3).

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
```bash
git add packages/core/src/drift/countryRisk.ts packages/core/src/drift/countryRisk.test.ts packages/core/src/drift/index.ts
git commit -m "Add FATF-modelled country-risk reference and lookup"
```

---

### Task 4: Geo enricher — domicile country-risk → jurisdiction signal (proposal 4)

**Files:**
- Create: `packages/core/src/pipeline/enrichers/geo.ts`
- Create: `packages/core/src/pipeline/enrichers/geo.test.ts`
- Modify: `packages/core/src/pipeline/index.ts`

**Interfaces:**
- Consumes: `countryRisk`, `FATF_REFERENCE_URL` (Task 3); `sourceQuality` (Task 2).
- Produces: `countryRiskSignals(baseline: KYCBaseline, asOf: string): Signal[]` — consumed by Task 8 (script) and Task 7 (reuse for owner nationalities).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/pipeline/enrichers/geo.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test geo`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/pipeline/enrichers/geo.ts`:
```ts
import { countryRisk, FATF_REFERENCE_URL } from "../../drift/countryRisk.ts";
import { sourceQuality } from "../../drift/confidence.ts";
import { SignalSchema, type KYCBaseline, type Signal } from "../../schemas/index.ts";

/**
 * Geopolitical enricher (proposal 4): score the company domicile against the
 * country-risk reference and emit a deterministic `jurisdiction` Signal when it
 * is high-risk or under increased monitoring. No LLM — Stage 0/1. Owner-level
 * country-of-origin is screened separately in `screen.ts` (proposal 6), reusing
 * `countryRisk`.
 */
export function countryRiskSignals(baseline: KYCBaseline, asOf: string): Signal[] {
  const risk = countryRisk(baseline.jurisdiction);
  if (risk.level === "standard") return [];
  const signal = SignalSchema.parse({
    id: `geo-${baseline.entityId}-domicile`,
    entityId: baseline.entityId,
    axis: "jurisdiction",
    type: "country_risk",
    date: asOf,
    sourceUrl: FATF_REFERENCE_URL,
    title: `Domicile ${baseline.jurisdiction} is ${risk.level}-risk: ${risk.reason}`,
    source: "regulator",
    payload: { country: baseline.jurisdiction, level: risk.level },
    confidence: sourceQuality("regulator"),
  });
  return [signal];
}
```

Create or update `packages/core/src/pipeline/index.ts` to export the enricher. The pipeline barrel currently exports the stage modules; add:
```ts
export * from "./enrichers/geo.ts";
```
(If `pipeline/index.ts` does not exist, check how `escalate.ts`/`stage2.ts` are exported and add the export alongside them. Do NOT remove existing exports.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test geo`
Expected: PASS (2/2).

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
```bash
git add packages/core/src/pipeline/enrichers/geo.ts packages/core/src/pipeline/enrichers/geo.test.ts packages/core/src/pipeline/index.ts
git commit -m "Add geo enricher emitting jurisdiction signal for high-risk domicile"
```

---

### Task 5: OpenSanctions connector — matcher + scaffold fetch

**Files:**
- Create: `packages/core/src/connectors/opensanctions.ts`
- Create: `packages/core/src/connectors/opensanctions.test.ts`
- Modify: `packages/core/src/connectors/index.ts`

**Interfaces:**
- Produces: `SanctionsEntry`, `SanctionsEntrySchema`, `matchSanctions(name, entries): SanctionsEntry | null`, `fetchSanctions(params: { apiKey?: string }): Promise<SanctionsEntry[]>` — consumed by Task 7 (`screenEntity`) and Task 8 (script).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connectors/opensanctions.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test opensanctions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/connectors/opensanctions.ts`:
```ts
import { z } from "zod";

/**
 * OpenSanctions connector (proposals 6 + 12). The deterministic `matchSanctions`
 * + a bundled sample fixture do the real work for the demo screen; the live
 * `fetchSanctions` is a documented scaffold — with no API key it returns [] and
 * logs, so nothing fake-passes as a live fetch. Aggregates OFAC / UN / EU / UK
 * HMT once wired.
 */
export const SanctionsEntrySchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  /** Originating list, e.g. "OFAC SDN", "EU", "PEP". */
  list: z.string().min(1),
  type: z.enum(["sanction", "pep"]),
  /** ISO alpha-2, when known. */
  country: z.string().optional(),
  sourceUrl: z.url(),
});
export type SanctionsEntry = z.infer<typeof SanctionsEntrySchema>;

/** Lowercased, whitespace-collapsed name for matching. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Return the first sanctions/PEP entry whose canonical name or any alias matches
 * `name` (normalized), or null. Exact normalized-form match — deliberately
 * conservative (no fuzzy matching) so a hit is defensible.
 */
export function matchSanctions(name: string, entries: SanctionsEntry[]): SanctionsEntry | null {
  const target = normalizeName(name);
  for (const e of entries) {
    if (normalizeName(e.name) === target) return e;
    if (e.aliases.some((a) => normalizeName(a) === target)) return e;
  }
  return null;
}

export interface FetchSanctionsParams {
  apiKey?: string;
}

/**
 * Live OpenSanctions fetch — scaffold. With no API key, returns [] and logs the
 * key seam rather than throwing, so `pnpm check` stays green and the demo runs
 * off the bundled sample fixture. Wiring the live API is deferred (proposal 12).
 */
export async function fetchSanctions(params: FetchSanctionsParams): Promise<SanctionsEntry[]> {
  if (!params.apiKey) {
    console.warn("[opensanctions] no apiKey — set OPENSANCTIONS_API_KEY for live screening; returning []");
    return [];
  }
  console.warn("[opensanctions] live fetch not implemented yet (proposal 12); returning []");
  return [];
}
```

Add to `packages/core/src/connectors/index.ts`:
```ts
export * from "./opensanctions.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test opensanctions`
Expected: PASS (3/3).

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
```bash
git add packages/core/src/connectors/opensanctions.ts packages/core/src/connectors/opensanctions.test.ts packages/core/src/connectors/index.ts
git commit -m "Add opensanctions matcher and scaffolded live fetch"
```

---

### Task 6: Sample sanctions/PEP fixture

**Files:**
- Create: `data/reference/sanctions-sample.json`
- Create: `packages/core/src/connectors/opensanctions.fixture.test.ts`

**Interfaces:**
- Produces: a JSON array of `SanctionsEntry` records, loaded by Task 8's script; one entry's name matches a Gulf Bridge Capital owner (Task 9).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connectors/opensanctions.fixture.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test opensanctions.fixture`
Expected: FAIL — file not found.

- [ ] **Step 3: Create the fixture**

Create `data/reference/sanctions-sample.json`:
```json
[
  {
    "name": "Viktor Petrov",
    "aliases": ["V. Petrov", "Viktor Petrow"],
    "list": "OFAC SDN",
    "type": "sanction",
    "country": "RU",
    "sourceUrl": "https://sanctionssearch.ofac.treas.gov/"
  },
  {
    "name": "Reza Najafi",
    "aliases": [],
    "list": "EU Consolidated",
    "type": "sanction",
    "country": "IR",
    "sourceUrl": "https://www.sanctionsmap.eu/"
  },
  {
    "name": "Hamad Al-Rashed",
    "aliases": ["H. Al Rashed"],
    "list": "PEP",
    "type": "pep",
    "country": "AE",
    "sourceUrl": "https://www.opensanctions.org/"
  }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test opensanctions.fixture`
Expected: PASS (2/2).

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
```bash
git add data/reference/sanctions-sample.json packages/core/src/connectors/opensanctions.fixture.test.ts
git commit -m "Add sample sanctions and PEP fixture for screening"
```

---

### Task 7: Static screening — `screenEntity` (proposal 6)

**Files:**
- Create: `packages/core/src/pipeline/screen.ts`
- Create: `packages/core/src/pipeline/screen.test.ts`
- Modify: `packages/core/src/pipeline/index.ts`

**Interfaces:**
- Consumes: `matchSanctions` (Task 5), `countryRisk`/`FATF_REFERENCE_URL` (Task 3), `sourceQuality` (Task 2).
- Produces: `screenEntity(baseline: KYCBaseline, entries: SanctionsEntry[], asOf: string): Signal[]` — consumed by Task 8 (script).

Screening rules (deterministic, one Signal per finding):
- entity **name** matches a sanctions entry → `reputation` Signal, type `sanctioned_entity`, confidence `sourceQuality("opensanctions")`.
- each beneficial-owner **name** match: `sanction` → `ownership` Signal (`sanctioned_controller`); `pep` → `reputation` Signal (`pep_individual`). confidence `sourceQuality("opensanctions")`.
- each owner **nationality** that is non-standard country-risk → `jurisdiction` Signal (`owner_country_risk`), confidence `sourceQuality("regulator")`, citing `FATF_REFERENCE_URL`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/pipeline/screen.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test screen`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/pipeline/screen.ts`:
```ts
import { matchSanctions, type SanctionsEntry } from "../connectors/opensanctions.ts";
import { countryRisk, FATF_REFERENCE_URL } from "../drift/countryRisk.ts";
import { sourceQuality } from "../drift/confidence.ts";
import { SignalSchema, type KYCBaseline, type Signal } from "../schemas/index.ts";

/**
 * Static screening (proposal 6): a deterministic, point-in-time screen of the
 * named people and their countries. Matches the entity, its beneficial owners
 * and directors against the sanctions/PEP list, and scores owner nationality
 * against the country-risk reference. Emits canonical `Signal`s on
 * ownership / reputation / jurisdiction, so Stage 1/2/3 consume them unchanged.
 * Pure: the caller supplies the sanctions `entries` (the `opensanctions`
 * connector or its bundled sample fixture).
 */
export function screenEntity(
  baseline: KYCBaseline,
  entries: SanctionsEntry[],
  asOf: string,
): Signal[] {
  const signals: Signal[] = [];
  const sanctionsConfidence = sourceQuality("opensanctions");
  const regulatorConfidence = sourceQuality("regulator");

  // Entity name itself on a sanctions list → reputation.
  const entityHit = matchSanctions(baseline.name, entries);
  if (entityHit) {
    signals.push(
      SignalSchema.parse({
        id: `screen-${baseline.entityId}-entity`,
        entityId: baseline.entityId,
        axis: "reputation",
        type: "sanctioned_entity",
        date: asOf,
        sourceUrl: entityHit.sourceUrl,
        title: `Entity "${baseline.name}" matches ${entityHit.list} (${entityHit.type}).`,
        source: "opensanctions",
        payload: { list: entityHit.list, matchType: entityHit.type },
        confidence: sanctionsConfidence,
      }),
    );
  }

  baseline.beneficialOwners.forEach((owner, i) => {
    // Sanctions / PEP match on the owner / director name.
    const hit = matchSanctions(owner.name, entries);
    if (hit) {
      const sanctioned = hit.type === "sanction";
      signals.push(
        SignalSchema.parse({
          id: `screen-${baseline.entityId}-owner-${i}-${hit.type}`,
          entityId: baseline.entityId,
          axis: sanctioned ? "ownership" : "reputation",
          type: sanctioned ? "sanctioned_controller" : "pep_individual",
          date: asOf,
          sourceUrl: hit.sourceUrl,
          title: `Beneficial owner "${owner.name}" matches ${hit.list} (${hit.type}).`,
          source: "opensanctions",
          payload: { owner: owner.name, list: hit.list, matchType: hit.type },
          confidence: sanctionsConfidence,
        }),
      );
    }

    // Owner country-of-origin risk → jurisdiction.
    if (owner.nationality) {
      const risk = countryRisk(owner.nationality);
      if (risk.level !== "standard") {
        signals.push(
          SignalSchema.parse({
            id: `screen-${baseline.entityId}-owner-${i}-country`,
            entityId: baseline.entityId,
            axis: "jurisdiction",
            type: "owner_country_risk",
            date: asOf,
            sourceUrl: FATF_REFERENCE_URL,
            title: `Owner "${owner.name}" nationality ${owner.nationality} is ${risk.level}-risk: ${risk.reason}`,
            source: "regulator",
            payload: { owner: owner.name, country: owner.nationality, level: risk.level },
            confidence: regulatorConfidence,
          }),
        );
      }
    }
  });

  return signals;
}
```

Add to `packages/core/src/pipeline/index.ts`:
```ts
export * from "./screen.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test screen`
Expected: PASS (5/5).

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
```bash
git add packages/core/src/pipeline/screen.ts packages/core/src/pipeline/screen.test.ts packages/core/src/pipeline/index.ts
git commit -m "Add static screening of owners, directors and domicile"
```

---

### Task 8: Screening extract script + load all signal files

**Files:**
- Create: `packages/scripts/src/screen.ts`
- Modify: `apps/web/src/lib/server/data.ts` (load all `<entityId>.*.json` signal files)

**Interfaces:**
- Consumes: `countryRiskSignals` (Task 4), `screenEntity` (Task 7), `SanctionsEntrySchema` (Task 5), `readData`/`writeData` (`packages/scripts/src/lib/repo.ts`).
- Produces: `data/signals/<entityId>.screen.json`; `loadBook` that picks it up.

> No unit test for the script or `loadBook` (offline script + app file, no harness). Verified by running the script and `pnpm check`.

- [ ] **Step 1: Write the script**

Create `packages/scripts/src/screen.ts`:
```ts
import { countryRiskSignals, screenEntity } from "@kyc/core/pipeline";
import { SanctionsEntrySchema, type SanctionsEntry } from "@kyc/core/connectors";
import { KYCBaselineSchema, type Signal } from "@kyc/core";
import { z } from "zod";
import { readData, writeData } from "./lib/repo.ts";

/**
 * Offline screen: run the deterministic geo enricher (proposal 4) + sanctions/PEP
 * + country-of-origin screen (proposal 6) for one entity and write the resulting
 * Signals to data/signals/<entityId>.screen.json, where the live app loads them
 * like any other source. Pass an entityId as the first arg (defaults to
 * "gulf-bridge-capital"). The screen date defaults to today's scenario instant.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/screen.ts <entityId> [asOf]
 */

const entityId = process.argv[2] ?? "gulf-bridge-capital";
const asOf = process.argv[3] ?? "2026-06-20";

const baseline = KYCBaselineSchema.parse(await readData(`baselines/${entityId}.json`));
const entries: SanctionsEntry[] = z
  .array(SanctionsEntrySchema)
  .parse(await readData("reference/sanctions-sample.json"));

const signals: Signal[] = [
  ...countryRiskSignals(baseline, asOf),
  ...screenEntity(baseline, entries, asOf),
];
signals.sort((a, b) => b.date.localeCompare(a.date));

const out = await writeData(`signals/${entityId}.screen.json`, signals);

const byAxis = signals.reduce<Record<string, number>>((acc, s) => {
  acc[s.axis] = (acc[s.axis] ?? 0) + 1;
  return acc;
}, {});
console.log(`Screened "${entityId}" → ${signals.length} signals → ${out}`);
console.log("By axis:", byAxis);
```

- [ ] **Step 2: Load all signal files in `loadBook`**

In `apps/web/src/lib/server/data.ts`, replace the hardcoded source loop in `loadBook` with a glob over all of the entity's signal files. Replace:
```ts
		const signals: Signal[] = [];
		const sigDir = join(dataDir, 'signals');
		for (const source of ['eventregistry', 'sec']) {
			const rel = `signals/${baseline.entityId}.${source}.json`;
			if (existsSync(join(sigDir, `${baseline.entityId}.${source}.json`))) {
				signals.push(...SignalArraySchema.parse(readJson(rel)));
			}
		}
```
with:
```ts
		const signals: Signal[] = [];
		const sigDir = join(dataDir, 'signals');
		// Load every signal file for this entity, regardless of source suffix
		// (eventregistry, sec, screen, …) — one connector layer, many sources.
		const prefix = `${baseline.entityId}.`;
		for (const file of readdirSync(sigDir)) {
			if (file.startsWith(prefix) && file.endsWith('.json')) {
				signals.push(...SignalArraySchema.parse(readJson(`signals/${file}`)));
			}
		}
```
(`readdirSync` is already imported at the top of `data.ts`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: PASS (scripts + web compile). The script run itself is exercised in Task 9.

- [ ] **Step 4: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/scripts run fix && pnpm --filter @kyc/web run fix && pnpm lint`
```bash
git add packages/scripts/src/screen.ts apps/web/src/lib/server/data.ts
git commit -m "Add screening extract script; load all per-entity signal files"
```

---

### Task 9: Gulf Bridge Capital demo entity + generated screening signals

**Files:**
- Create: `data/baselines/gulf-bridge-capital.json`
- Create (generated): `data/signals/gulf-bridge-capital.screen.json` (produced by the Task 8 script)

**Interfaces:**
- Consumes: the Task 8 script; the Task 6 fixture (its "Viktor Petrov" entry matches an owner here).

> The baseline is hand-authored; the signals file is generated by running the script (not hand-written), proving the pipeline end-to-end.

- [ ] **Step 1: Create the UAE baseline**

Create `data/baselines/gulf-bridge-capital.json`:
```json
{
  "entityId": "gulf-bridge-capital",
  "name": "Gulf Bridge Capital Ltd",
  "aliases": ["Gulf Bridge", "GBC"],
  "legalForm": "ADGM private company limited by shares",
  "jurisdiction": "AE",
  "businessModel": "Cross-border trade finance and payments advisory for Gulf and CIS corporate clients.",
  "beneficialOwners": [
    { "name": "Hamad Al-Rashed", "role": "Chairman", "nationality": "AE" },
    { "name": "Viktor Petrov", "share": 0.4, "role": "Investor (via offshore vehicle)", "nationality": "RU" },
    { "name": "Reza Najafi", "share": 0.15, "role": "Minority investor", "nationality": "IR" }
  ],
  "riskRating": "medium",
  "onboardedAt": "2021-04-12"
}
```

- [ ] **Step 2: Generate the screening signals**

Run: `pnpm --filter @kyc/scripts exec tsx src/screen.ts gulf-bridge-capital 2026-06-20`
Expected output: a non-zero signal count with `ownership`, `reputation`, and `jurisdiction` axes represented (Viktor Petrov → ownership sanctioned_controller + jurisdiction RU is standard so no country signal for RU unless listed; Reza Najafi IR → jurisdiction owner_country_risk + sanctions hit reputation; Hamad Al-Rashed → reputation pep_individual). It writes `data/signals/gulf-bridge-capital.screen.json`.

> Note: RU is not on the modelled country-risk list, so Viktor Petrov contributes an `ownership` sanctioned-controller signal (the strong one); IR (Reza Najafi) contributes both a sanctions reputation hit and an `owner_country_risk` jurisdiction signal; Hamad Al-Rashed is a PEP → reputation. This is the intended multi-axis drift.

- [ ] **Step 3: Confirm the book loads it**

Run: `pnpm check`
Expected: PASS. Then confirm the generated file parses as `Signal[]`:
Run: `pnpm --filter @kyc/core exec tsx -e "import {SignalArraySchema} from './src/schemas/index.ts'; import {readFileSync} from 'node:fs'; SignalArraySchema.parse(JSON.parse(readFileSync('../../data/signals/gulf-bridge-capital.screen.json','utf8'))); console.log('ok');"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add data/baselines/gulf-bridge-capital.json data/signals/gulf-bridge-capital.screen.json
git commit -m "Add Gulf Bridge Capital UAE entity with generated screening signals"
```

---

## Self-Review

**Spec coverage (Phase 2a scope):**
- Proposal 4 (geo/regulatory enrichers) → Tasks 3–4 (country-risk → jurisdiction). The "regulatory/sanctions lookup → reputation" half is delivered by the entity-level sanctions check in Task 7 now; the richer enforcement feed is proposal 12 (Phase 4). Documented mapping. ✅
- Proposal 6 (static screening) → Tasks 1, 5, 6, 7 (nationality field; sanctions matcher + fixture; owner/director/entity screen; owner country-of-origin). ✅
- Foundation deferred from spec Phase 0 consumed here: `nationality` (Task 1), `regulator` source + prior (Task 2), country-risk + sanctions reference data (Tasks 3, 6). ✅
- Demo entity (Gulf Bridge Capital, UAE) + generated signals → Tasks 8–9. ✅
- Proposals 3 (graph) + 5 (propagation), and `Alert.relationshipPath` + graph schemas → **deferred to Phase 2b** (separate plan). ✅ (Stated in the plan intro.)

**Placeholder scan:** none — every step has concrete code/commands. ✅

**Type consistency:** `countryRisk(code): CountryRisk`, `countryRiskSignals(baseline, asOf): Signal[]`, `matchSanctions(name, entries): SanctionsEntry | null`, `fetchSanctions({apiKey?}): Promise<SanctionsEntry[]>`, `screenEntity(baseline, entries, asOf): Signal[]` — names/signatures match between defining and consuming tasks. `SanctionsEntry`/`SanctionsEntrySchema` defined in Task 5, consumed in 6/7/8. The Task 6 fixture's `"Viktor Petrov"` entry matches the Task 9 owner. ✅
