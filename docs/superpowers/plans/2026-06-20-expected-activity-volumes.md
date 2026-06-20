# Expected Activity / Transaction Volumes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured `expectedActivity` profile to the KYC baseline and let signals that breach it give a bounded boost to the relevant drift axis, with the breach surfaced in the UI.

**Architecture:** A new optional `expectedActivity` field on `KYCBaseline`; pure expectation helpers in `packages/core/src/drift/expectation.ts`; the helpers threaded into `scoreAxis`/`scoreDriftVector` (read from `baseline.expectedActivity`, so no caller changes); demo data on two baselines; and UI that shows the expected profile plus a per-row breach note (reusing the core helper).

**Tech Stack:** TypeScript, Zod v4, Vitest, SvelteKit (Svelte 5 runes), shadcn-svelte, Tailwind.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-20-expected-activity-volumes-design.md`. Approach **B** (display + explain + bounded scoring contribution); **no** rewrite of scale aggregation, **no** new signal payload fields, **no** LLM-prompt changes.
- `expectedActivity` is **optional** — existing baselines must parse and score exactly as today.
- Expectation boost is bounded to `[1, 1.5]` and multiplies only **breaching** signals: volume breaches → `scale` axis, geo breaches → `jurisdiction` axis.
- Zod imports in `packages/core` use the `.ts` extension (e.g. `from "./common.ts"`), matching existing files.
- Before committing any task that touched code, run in order: `pnpm check`, `pnpm fix`, `pnpm lint`.
- Commit as the user: append `--author="olivierluethy <olivier.luethy@gmx.net>"`, short title, no description block.
- Test runner: `pnpm --filter @kyc/core test -- <file>` (Vitest).

---

## File Structure

- `packages/core/src/schemas/baseline.ts` — add `BandSchema`, `ExpectedActivitySchema`, `expectedActivity` field. (Task 1)
- `packages/core/src/schemas/baseline.test.ts` — schema tests. (Task 1)
- `packages/core/src/drift/expectation.ts` — **new** pure helpers. (Task 2)
- `packages/core/src/drift/expectation.test.ts` — **new** helper tests. (Task 2)
- `packages/core/src/drift/index.ts` — export the new module. (Task 2)
- `packages/core/src/drift/score.ts` — thread expectation into scoring. (Task 3)
- `packages/core/src/drift/score.test.ts` — scoring tests. (Task 3)
- `data/baselines/strategy.json`, `data/baselines/gulf-bridge-capital.json` — demo data. (Task 4)
- `apps/web/src/lib/view.ts` — `deriveExpectationNote`, `fmtBandUsd`. (Task 5)
- `apps/web/src/lib/components/app/CompanyDetail.svelte` — expected-activity block. (Task 5)
- `apps/web/src/lib/components/app/EventsView.svelte` — per-row breach note. (Task 5)

---

## Task 1: Baseline schema — Band + ExpectedActivity

**Files:**
- Modify: `packages/core/src/schemas/baseline.ts`
- Test: `packages/core/src/schemas/baseline.test.ts`

**Interfaces:**
- Consumes: nothing new (`z` already imported in `baseline.ts`).
- Produces: `BandSchema`, `type Band`, `ExpectedActivitySchema`, `type ExpectedActivity`, and `KYCBaseline.expectedActivity?: ExpectedActivity`. All re-exported via `packages/core/src/schemas/index.ts` (which already does `export * from "./baseline.ts"`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/schemas/baseline.test.ts` (and add the import on line 2):

```ts
import { BeneficialOwnerSchema, BandSchema, ExpectedActivitySchema, KYCBaselineSchema } from "./baseline.ts";

describe("ExpectedActivitySchema", () => {
  it("parses a full expected-activity profile", () => {
    const ea = ExpectedActivitySchema.parse({
      annualVolumeUsd: { min: 50_000_000, max: 300_000_000 },
      typicalTxnUsd: { min: 10_000, max: 5_000_000 },
      channels: ["enterprise licensing"],
      counterpartyGeographies: ["US", "CH"],
    });
    expect(ea.annualVolumeUsd.max).toBe(300_000_000);
    expect(ea.counterpartyGeographies).toEqual(["US", "CH"]);
  });

  it("defaults channels and geographies to empty arrays", () => {
    const ea = ExpectedActivitySchema.parse({ annualVolumeUsd: { min: 0, max: 1 } });
    expect(ea.channels).toEqual([]);
    expect(ea.counterpartyGeographies).toEqual([]);
  });

  it("rejects a band whose max is below its min", () => {
    expect(() => BandSchema.parse({ min: 10, max: 1 })).toThrow();
  });

  it("rejects a non-ISO-2 counterparty geography", () => {
    expect(() =>
      ExpectedActivitySchema.parse({
        annualVolumeUsd: { min: 0, max: 1 },
        counterpartyGeographies: ["USA"],
      }),
    ).toThrow();
  });

  it("attaches to a baseline and stays optional", () => {
    const withEa = KYCBaselineSchema.parse({
      entityId: "e1", name: "E1", jurisdiction: "CH", businessModel: "x",
      riskRating: "low", onboardedAt: "2020-01-01",
      expectedActivity: { annualVolumeUsd: { min: 0, max: 1 } },
    });
    expect(withEa.expectedActivity?.annualVolumeUsd.max).toBe(1);

    const withoutEa = KYCBaselineSchema.parse({
      entityId: "e2", name: "E2", jurisdiction: "CH", businessModel: "x",
      riskRating: "low", onboardedAt: "2020-01-01",
    });
    expect(withoutEa.expectedActivity).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @kyc/core test -- baseline.test.ts`
Expected: FAIL — `BandSchema`/`ExpectedActivitySchema` are not exported.

- [ ] **Step 3: Implement the schema**

In `packages/core/src/schemas/baseline.ts`, after the `BeneficialOwnerSchema`/`type BeneficialOwner` block (before `KYCBaselineSchema`), insert:

```ts
/** A numeric expectation band [min, max] in some unit (e.g. USD). */
export const BandSchema = z
  .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
  .refine((b) => b.max >= b.min, "max must be >= min");
export type Band = z.infer<typeof BandSchema>;

/**
 * The expected activity/transaction profile captured at onboarding — the Layer-2
 * "simulated internal bank intelligence" that public signals are contextualised
 * against. Optional on the baseline: entities without it score exactly as before.
 */
export const ExpectedActivitySchema = z.object({
  /** Expected annual transaction / throughput volume, USD. */
  annualVolumeUsd: BandSchema,
  /** Typical single-transaction size, USD. */
  typicalTxnUsd: BandSchema.optional(),
  /** Expected transactions per month. */
  monthlyTxnCount: BandSchema.optional(),
  /** Primary channels / products (e.g. "enterprise licensing", "wire"). */
  channels: z.array(z.string()).default([]),
  /** Expected counterparty geographies — ISO 3166-1 alpha-2. */
  counterpartyGeographies: z
    .array(z.string().regex(/^[A-Z]{2}$/, "must be an ISO 3166-1 alpha-2 code"))
    .default([]),
});
export type ExpectedActivity = z.infer<typeof ExpectedActivitySchema>;
```

Then add the field to `KYCBaselineSchema`. Immediately after the `onboardedAt: EventDate,` line, insert:

```ts
  /** Expected activity / transaction volumes captured at onboarding (Layer 2). */
  expectedActivity: ExpectedActivitySchema.optional(),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @kyc/core test -- baseline.test.ts`
Expected: PASS (all describe blocks, including the pre-existing nationality tests).

- [ ] **Step 5: Typecheck, then commit**

Run: `pnpm check`
Expected: 0 errors.

```bash
git add packages/core/src/schemas/baseline.ts packages/core/src/schemas/baseline.test.ts
git commit -m "Add expectedActivity profile to KYC baseline schema" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 2: Expectation helpers

**Files:**
- Create: `packages/core/src/drift/expectation.ts`
- Create: `packages/core/src/drift/expectation.test.ts`
- Modify: `packages/core/src/drift/index.ts`

**Interfaces:**
- Consumes: `type DriftAxis`, `type ExpectedActivity`, `type Signal` from `../schemas/index.ts` (Task 1 added `ExpectedActivity`).
- Produces:
  - `signalMagnitudeUsd(s: Signal): number | null`
  - `signalGeographies(s: Signal): string[]`
  - `interface ExpectationBreach { kind: "volume" | "geo"; ratio?: number; detail: string }`
  - `expectationBreach(s: Signal, expected: ExpectedActivity | undefined): ExpectationBreach | null`
  - `expectationBoost(s: Signal, expected: ExpectedActivity | undefined, axis: DriftAxis): number`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/drift/expectation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  expectationBoost,
  expectationBreach,
  signalGeographies,
  signalMagnitudeUsd,
} from "./expectation.ts";
import type { ExpectedActivity, Signal } from "../schemas/index.ts";

const base: Signal = {
  id: "s1", entityId: "e1", axis: "scale", type: "valuation_change",
  date: "2026-01-01", sourceUrl: "https://example.com/a", title: "t",
  source: "market", payload: {}, confidence: 0.8,
};

const expected: ExpectedActivity = {
  annualVolumeUsd: { min: 50_000_000, max: 300_000_000 },
  typicalTxnUsd: { min: 10_000, max: 5_000_000 },
  channels: [],
  counterpartyGeographies: ["US", "CH"],
};

describe("signalMagnitudeUsd", () => {
  it("reads amountUsd / valuationUsd / magnitudeUsd, preferring amountUsd", () => {
    expect(signalMagnitudeUsd({ ...base, payload: { amountUsd: 500_000_000 } })).toBe(500_000_000);
    expect(signalMagnitudeUsd({ ...base, payload: { valuationUsd: 12 } })).toBe(12);
    expect(signalMagnitudeUsd({ ...base, payload: { magnitudeUsd: -250 } })).toBe(250);
  });
  it("returns null when no magnitude is present", () => {
    expect(signalMagnitudeUsd(base)).toBeNull();
  });
});

describe("signalGeographies", () => {
  it("extracts an ISO-2 country from the payload", () => {
    expect(signalGeographies({ ...base, payload: { country: "IR" } })).toEqual(["IR"]);
  });
  it("ignores non-ISO-2 country values", () => {
    expect(signalGeographies({ ...base, payload: { country: "Iran" } })).toEqual([]);
  });
});

describe("expectationBreach", () => {
  it("is null when there is no expected profile", () => {
    expect(expectationBreach({ ...base, payload: { amountUsd: 1e12 } }, undefined)).toBeNull();
  });
  it("flags a volume breach above the typical-txn ceiling", () => {
    const b = expectationBreach({ ...base, payload: { amountUsd: 250_000_000 } }, expected);
    expect(b?.kind).toBe("volume");
    expect(b?.ratio).toBeCloseTo(50, 0);
  });
  it("is null for a magnitude within the band", () => {
    expect(expectationBreach({ ...base, payload: { amountUsd: 1_000_000 } }, expected)).toBeNull();
  });
  it("flags a geo breach for an unexpected counterparty country", () => {
    const b = expectationBreach({ ...base, payload: { country: "IR" } }, expected);
    expect(b?.kind).toBe("geo");
  });
});

describe("expectationBoost", () => {
  it("is 1 with no expected profile", () => {
    expect(expectationBoost({ ...base, payload: { amountUsd: 1e12 } }, undefined, "scale")).toBe(1);
  });
  it("boosts ~1.25 for a ~10x volume breach on the scale axis", () => {
    const boost = expectationBoost({ ...base, payload: { amountUsd: 50_000_000 } }, expected, "scale");
    expect(boost).toBeCloseTo(1.25, 2);
  });
  it("saturates at 1.5 for an extreme breach", () => {
    const boost = expectationBoost({ ...base, payload: { amountUsd: 5e12 } }, expected, "scale");
    expect(boost).toBe(1.5);
  });
  it("does not boost a volume breach on a non-scale axis", () => {
    expect(expectationBoost({ ...base, payload: { amountUsd: 5e12 } }, expected, "jurisdiction")).toBe(1);
  });
  it("boosts 1.3 for a geo breach on the jurisdiction axis only", () => {
    const s = { ...base, payload: { country: "IR" } };
    expect(expectationBoost(s, expected, "jurisdiction")).toBeCloseTo(1.3, 10);
    expect(expectationBoost(s, expected, "scale")).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @kyc/core test -- expectation.test.ts`
Expected: FAIL — module `./expectation.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `packages/core/src/drift/expectation.ts`:

```ts
import type { DriftAxis, ExpectedActivity, Signal } from "../schemas/index.ts";

/** USD magnitude carried by a signal's payload (absolute), or null when none. */
export function signalMagnitudeUsd(s: Signal): number | null {
  const p = s.payload;
  for (const key of ["amountUsd", "valuationUsd", "magnitudeUsd"] as const) {
    const v = p[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.abs(v);
  }
  return null;
}

/** Counterparty geographies (ISO-2) a signal implies, from its payload. */
export function signalGeographies(s: Signal): string[] {
  const country = s.payload.country;
  return typeof country === "string" && /^[A-Z]{2}$/.test(country) ? [country] : [];
}

export interface ExpectationBreach {
  kind: "volume" | "geo";
  /** magnitude / band ceiling, for volume breaches. */
  ratio?: number;
  /** Human-readable breach summary for reasoning / UI. */
  detail: string;
}

/** Compact USD for breach detail strings: $1.2B / $340M / $5.0M / $5K. */
function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs}`;
}

/**
 * Whether a signal breaches the expected-activity profile, and how. Volume
 * breaches compare the signal's USD magnitude against the typical-transaction
 * band (falling back to the annual-volume band); geo breaches flag a counterparty
 * geography outside the expected set. Returns null when within expectations, when
 * no profile exists, or when the payload carries nothing comparable. Volume takes
 * precedence over geo when both apply.
 */
export function expectationBreach(
  s: Signal,
  expected: ExpectedActivity | undefined,
): ExpectationBreach | null {
  if (!expected) return null;

  const magnitude = signalMagnitudeUsd(s);
  if (magnitude !== null) {
    const ceiling = expected.typicalTxnUsd?.max ?? expected.annualVolumeUsd.max;
    if (ceiling > 0 && magnitude > ceiling) {
      const ratio = magnitude / ceiling;
      const unit = expected.typicalTxnUsd ? "typical txn" : "annual volume";
      const mult = ratio < 10 ? ratio.toFixed(1) : String(Math.round(ratio));
      return { kind: "volume", ratio, detail: `~${mult}× ${unit} (${fmtUsd(magnitude)} vs ${fmtUsd(ceiling)})` };
    }
  }

  if (expected.counterpartyGeographies.length > 0) {
    const unexpected = signalGeographies(s).filter(
      (g) => !expected.counterpartyGeographies.includes(g),
    );
    if (unexpected.length > 0) {
      return { kind: "geo", detail: `counterparty geo ${unexpected.join(", ")} not expected` };
    }
  }

  return null;
}

const MAX_VOLUME_BOOST = 0.5; // total multiplier saturates at 1.5
const VOLUME_BOOST_K = 0.25; // a ~10x breach (log10 = 1) adds +0.25
const GEO_BOOST = 0.3;

/**
 * Bounded multiplier (>= 1, <= 1.5) applied to a breaching signal's weighted
 * drift contribution. Volume breaches boost the `scale` axis; geo breaches boost
 * `jurisdiction`. Returns 1 when there is no profile, no breach, or the breach
 * kind does not match the axis being scored.
 */
export function expectationBoost(
  s: Signal,
  expected: ExpectedActivity | undefined,
  axis: DriftAxis,
): number {
  const breach = expectationBreach(s, expected);
  if (!breach) return 1;
  if (breach.kind === "volume" && axis === "scale" && breach.ratio) {
    return 1 + Math.min(MAX_VOLUME_BOOST, VOLUME_BOOST_K * Math.log10(breach.ratio));
  }
  if (breach.kind === "geo" && axis === "jurisdiction") {
    return 1 + GEO_BOOST;
  }
  return 1;
}
```

- [ ] **Step 4: Export the module**

In `packages/core/src/drift/index.ts`, add a line:

```ts
export * from "./expectation.ts";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @kyc/core test -- expectation.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck, then commit**

Run: `pnpm check`
Expected: 0 errors.

```bash
git add packages/core/src/drift/expectation.ts packages/core/src/drift/expectation.test.ts packages/core/src/drift/index.ts
git commit -m "Add expectation breach and boost helpers" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 3: Thread expectation into drift scoring

**Files:**
- Modify: `packages/core/src/drift/score.ts`
- Test: `packages/core/src/drift/score.test.ts`

**Interfaces:**
- Consumes: `expectationBoost`, `expectationBreach` from `./expectation.ts`; `type ExpectedActivity` from `../schemas/index.ts`.
- Produces: new `scoreAxis` signature `scoreAxis(signals, asOf, opts?: { expected?: ExpectedActivity; axis?: DriftAxis }): AxisDrift`. `scoreDriftVector` is unchanged in signature and passes `baseline.expectedActivity` + axis down — so its callers (`+page.svelte`, `escalate.ts`) need no change.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/drift/score.test.ts`:

```ts
import type { ExpectedActivity } from "../schemas/index.ts";

describe("scoreAxis expectation boost", () => {
  const expected: ExpectedActivity = {
    annualVolumeUsd: { min: 50_000_000, max: 300_000_000 },
    typicalTxnUsd: { min: 10_000, max: 5_000_000 },
    channels: [],
    counterpartyGeographies: ["US", "CH"],
  };
  const scaleSignal: Signal = {
    ...base, id: "m1", axis: "scale", type: "valuation_change",
    source: "market", payload: { amountUsd: 500_000_000 },
  };

  it("scores a breaching scale signal higher with expectations than without", () => {
    const withExp = scoreAxis([scaleSignal], "2026-01-01", { expected, axis: "scale" });
    const without = scoreAxis([scaleSignal], "2026-01-01", { axis: "scale" });
    expect(withExp.score).toBeGreaterThan(without.score);
    expect(withExp.reasoning).toContain("Exceeds expected");
  });

  it("leaves a within-band signal unchanged", () => {
    const small: Signal = { ...scaleSignal, payload: { amountUsd: 1_000_000 } };
    const withExp = scoreAxis([small], "2026-01-01", { expected, axis: "scale" });
    const without = scoreAxis([small], "2026-01-01", { axis: "scale" });
    expect(withExp.score).toBeCloseTo(without.score, 10);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @kyc/core test -- score.test.ts`
Expected: FAIL — `scoreAxis` does not accept an options object / score is unchanged.

- [ ] **Step 3: Implement the threading**

In `packages/core/src/drift/score.ts`:

3a. Extend the imports. Change the `confidence.ts` import line to also pull the expectation helpers, and add `ExpectedActivity` to the schema import. After the existing:

```ts
import { confidenceForAxis, recencyWeight } from "./confidence.ts";
```

add:

```ts
import { expectationBoost, expectationBreach } from "./expectation.ts";
```

and add `type ExpectedActivity,` to the existing `from "../schemas/index.ts"` import list.

3b. Replace the whole `scoreAxis` function with:

```ts
/** Score a single axis from the signals attributed to it. */
export function scoreAxis(
  signals: Signal[],
  asOf: string,
  opts: { expected?: ExpectedActivity; axis?: DriftAxis } = {},
): AxisDrift {
  if (signals.length === 0) {
    return { score: 0, confidence: 0, status: "stable", tierReached: "stage0", signalIds: [] };
  }

  let weighted = 0;
  const breaches: string[] = [];
  const sorted = [...signals].sort((a, b) => b.date.localeCompare(a.date));
  for (const s of sorted) {
    const boost = opts.axis ? expectationBoost(s, opts.expected, opts.axis) : 1;
    weighted += s.confidence * recencyWeight(s.date, asOf) * clusterBonus(s) * boost;
    if (boost > 1) {
      const breach = expectationBreach(s, opts.expected);
      if (breach) breaches.push(breach.detail);
    }
  }

  const score = 1 - Math.exp(-weighted / SATURATION_K);
  const latest = sorted[0]!;
  const breachNote = breaches.length > 0 ? ` Exceeds expected: ${breaches[0]}.` : "";
  return {
    score,
    confidence: confidenceForAxis(sorted, asOf),
    status: statusForScore(score),
    tierReached: "stage0",
    signalIds: sorted.map((s) => s.id),
    reasoning: `${signals.length} signal(s); latest: "${latest.title}" (${latest.date.slice(0, 10)}).${breachNote}`,
  };
}
```

3c. In `scoreDriftVector`, replace the `axes` construction:

```ts
  const axes = Object.fromEntries(
    AXES.map((axis) => [axis, scoreAxis(byAxis.get(axis)!, asOf)]),
  ) as Record<DriftAxis, AxisDrift>;
```

with:

```ts
  const axes = Object.fromEntries(
    AXES.map((axis) => [
      axis,
      scoreAxis(byAxis.get(axis)!, asOf, { expected: baseline.expectedActivity, axis }),
    ]),
  ) as Record<DriftAxis, AxisDrift>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @kyc/core test -- score.test.ts`
Expected: PASS — including the pre-existing `scoreAxis` tests (they call `scoreAxis(signals, asOf)` with no opts, which still works).

- [ ] **Step 5: Run the full core suite, typecheck, then commit**

Run: `pnpm --filter @kyc/core test`
Expected: PASS (no regressions in confidence/countryRisk/etc.).

Run: `pnpm check`
Expected: 0 errors.

```bash
git add packages/core/src/drift/score.ts packages/core/src/drift/score.test.ts
git commit -m "Boost drift score when signals breach expected activity" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 4: Demo baseline data

**Files:**
- Modify: `data/baselines/strategy.json`
- Modify: `data/baselines/gulf-bridge-capital.json`

**Interfaces:**
- Consumes: `ExpectedActivitySchema` shape from Task 1. Validated at app load by `loadBook()` (`KYCBaselineSchema.parse`).
- Produces: two baselines carrying `expectedActivity`, exercised by the demo entities (strategy has market/chain magnitude signals; gulf-bridge has a regulator `country: "IR"` signal).

- [ ] **Step 1: Add expectedActivity to strategy**

In `data/baselines/strategy.json`, add a trailing comma to the current last field (`"domain": ...`) and append before the closing `}`:

```json
  "expectedActivity": {
    "annualVolumeUsd": { "min": 50000000, "max": 300000000 },
    "typicalTxnUsd": { "min": 10000, "max": 5000000 },
    "monthlyTxnCount": { "min": 200, "max": 2000 },
    "channels": ["enterprise licensing", "cloud subscriptions", "support contracts"],
    "counterpartyGeographies": ["US", "GB", "DE", "CH", "CA", "AU"]
  }
```

- [ ] **Step 2: Add expectedActivity to gulf-bridge-capital**

In `data/baselines/gulf-bridge-capital.json`, append (with the same trailing-comma fix on the previous last field):

```json
  "expectedActivity": {
    "annualVolumeUsd": { "min": 20000000, "max": 150000000 },
    "typicalTxnUsd": { "min": 50000, "max": 10000000 },
    "channels": ["trade finance", "correspondent banking", "wire"],
    "counterpartyGeographies": ["AE", "SA", "KW", "QA", "BH", "OM"]
  }
```

- [ ] **Step 3: Verify both baselines parse against the schema**

Run (from the repo root):

```bash
pnpm --filter @kyc/scripts exec tsx -e "import { KYCBaselineSchema } from '@kyc/core'; import { readFileSync } from 'node:fs'; for (const f of ['strategy','gulf-bridge-capital']) { const b = KYCBaselineSchema.parse(JSON.parse(readFileSync('data/baselines/'+f+'.json','utf8'))); console.log(f, 'ok —', b.expectedActivity?.counterpartyGeographies.join(',')); }"
```

Expected output:
```
strategy ok — US,GB,DE,CH,CA,AU
gulf-bridge-capital ok — AE,SA,KW,QA,BH,OM
```
If it throws a ZodError, fix the JSON (commas / band min<=max / ISO-2 codes) and re-run.

- [ ] **Step 4: Commit**

```bash
git add data/baselines/strategy.json data/baselines/gulf-bridge-capital.json
git commit -m "Add expected-activity profiles to demo baselines" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 5: UI — expected-activity panel and per-row breach note

**Files:**
- Modify: `apps/web/src/lib/view.ts`
- Modify: `apps/web/src/lib/components/app/CompanyDetail.svelte`
- Modify: `apps/web/src/lib/components/app/EventsView.svelte`

**Interfaces:**
- Consumes: `expectationBreach` from `@kyc/core/drift`; `type Band`, `type ExpectedActivity`, `type Signal` from `@kyc/core`; `entity.baseline.expectedActivity` (BookEntity already carries the baseline).
- Produces (in `view.ts`): `fmtBandUsd(b: Band): string` and `deriveExpectationNote(s: Signal, expected: ExpectedActivity | undefined): string | null`.

- [ ] **Step 1: Add the view helpers**

In `apps/web/src/lib/view.ts`:

1a. Extend the top type-import to add `Band` and `ExpectedActivity`. The current first line is:

```ts
import type { DriftAxis, DriftVector, KYCBaseline, RiskStatus, Signal } from '@kyc/core';
```

Replace with:

```ts
import type { Band, DriftAxis, DriftVector, ExpectedActivity, KYCBaseline, RiskStatus, Signal } from '@kyc/core';
import { expectationBreach } from '@kyc/core/drift';
```

1b. At the end of the file, append:

```ts
/** Format a USD band as a compact range, e.g. "$50M–$300M". */
export function fmtBandUsd(b: Band): string {
	return `${fmtUsd(b.min)}–${fmtUsd(b.max)}`;
}

/**
 * A concise "vs expected" note for a signal that breaches the baseline's
 * expected-activity profile, or null. Reuses the core breach helper so the UI
 * and the drift score agree on what counts as a breach.
 */
export function deriveExpectationNote(s: Signal, expected: ExpectedActivity | undefined): string | null {
	return expectationBreach(s, expected)?.detail ?? null;
}
```

(`fmtUsd` already exists as a private helper in `view.ts` from the market-research work; `fmtBandUsd` reuses it.)

- [ ] **Step 2: Verify the helpers typecheck**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Add the expected-activity block to CompanyDetail**

In `apps/web/src/lib/components/app/CompanyDetail.svelte`:

3a. Add `fmtBandUsd` to the `$lib/view` import. Change:

```ts
import { fmtDate, statusVar, type BookEntity } from '$lib/view';
```

to:

```ts
import { fmtBandUsd, fmtDate, statusVar, type BookEntity } from '$lib/view';
```

3b. Immediately after the "Business model" `<div>...</div>` block (the one ending at the `</div>` after the `businessModel` paragraph) and before the "live drift verdict" comment, insert:

```svelte
	{#if baseline.expectedActivity}
		{@const ea = baseline.expectedActivity}
		<div>
			<div class="text-muted2 mb-1.5 text-[10px] tracking-[0.16em] uppercase">Expected activity</div>
			<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
				<dt class="text-muted2">Annual vol</dt>
				<dd class="text-text2 font-mono">{fmtBandUsd(ea.annualVolumeUsd)}</dd>
				{#if ea.typicalTxnUsd}
					<dt class="text-muted2">Typical txn</dt>
					<dd class="text-text2 font-mono">{fmtBandUsd(ea.typicalTxnUsd)}</dd>
				{/if}
				{#if ea.counterpartyGeographies.length}
					<dt class="text-muted2">Geographies</dt>
					<dd class="text-text2">{ea.counterpartyGeographies.join(', ')}</dd>
				{/if}
			</dl>
			{#if ea.channels.length}
				<p class="text-muted2 mt-1.5 text-[10px] leading-relaxed">Channels: {ea.channels.join(' · ')}</p>
			{/if}
		</div>
	{/if}
```

- [ ] **Step 4: Add the per-row breach note to EventsView**

In `apps/web/src/lib/components/app/EventsView.svelte`:

4a. Add `deriveExpectationNote` to the `$lib/view` import (alphabetical, before `deriveMarketResearch`):

```ts
	import {
		deriveExpectationNote,
		deriveMarketResearch,
		deriveSignalInference,
		fmtDate,
		secFilingDescription,
		secFormCode,
		statusVar,
		type BookEntity
	} from '$lib/view';
```

4b. Inside the `{#each events as s (s.id)}` block, add a `@const` alongside the others (after the `titleText` const):

```svelte
					{@const note = deriveExpectationNote(s, entity.baseline.expectedActivity)}
```

4c. Replace the Market research cell body. Change:

```svelte
						<!-- Market research -->
						<Table.Cell class="text-muted2 py-2 align-top leading-snug whitespace-normal">
							{deriveMarketResearch(s)}
						</Table.Cell>
```

to:

```svelte
						<!-- Market research -->
						<Table.Cell class="text-muted2 py-2 align-top leading-snug whitespace-normal">
							{deriveMarketResearch(s)}
							{#if note}
								<span class="text-[10px]" style="color: var(--alert)"> · ⚠ {note}</span>
							{/if}
						</Table.Cell>
```

- [ ] **Step 5: Verify in the browser**

Run: `pnpm check` → 0 errors. Then with the dev server running (`pnpm --filter @kyc/web dev`), open the app and select **MicroStrategy** (strategy):
- CompanyDetail shows an "Expected activity" block (Annual vol `$50M–$300M`, Typical txn `$10K–$5M`, Geographies, Channels).
- In the events table, the $500M financing (market) and $250M BTC (chain) rows show a red `· ⚠ ~50× typical txn …` note in the Market research column.
- Select **Gulf Bridge Capital**: the regulator/Iran row shows `· ⚠ counterparty geo IR not expected`.
- The scale (and jurisdiction, for gulf-bridge) axis reasoning in the breakdown ends with "Exceeds expected: …".

- [ ] **Step 6: Fix, lint, then commit**

Run: `pnpm fix` then `pnpm lint`
Expected: lint clean.

```bash
git add apps/web/src/lib/view.ts apps/web/src/lib/components/app/CompanyDetail.svelte apps/web/src/lib/components/app/EventsView.svelte
git commit -m "Surface expected activity and breach notes in the UI" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Self-Review notes

- **Spec coverage:** §1 schema → Task 1; §2 data → Task 4; §3 logic (helpers + threading) → Tasks 2–3; §4 UI (panel + breach note) → Task 5; §5 testing → Tasks 1–3 tests. All sections covered.
- **Type consistency:** `expectationBreach`/`expectationBoost`/`signalMagnitudeUsd`/`signalGeographies` signatures are identical across Tasks 2, 3, 5. `ExpectedActivity`/`Band` defined in Task 1 and consumed unchanged. `scoreAxis` opts object (`{ expected?, axis? }`) defined in Task 3 and used by `scoreDriftVector`.
- **No caller breakage:** `scoreAxis`'s new third param is optional; existing `scoreAxis(signals, asOf)` calls (tests) and `scoreDriftVector` callers (`+page.svelte`, `escalate.ts`) are unaffected.
