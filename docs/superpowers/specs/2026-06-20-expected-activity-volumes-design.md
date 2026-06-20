# Expected Activity / Transaction Volumes — Design

Adds the missing **Layer 2 (Simulated Internal Bank Intelligence)** requirement:
structured *expected activity and transaction volumes* on the KYC baseline, and
wires them into cheap-tier drift scoring so public signals are **contextualised
and narrowed** against what the bank expected at onboarding.

## Goal

Today a baseline's only behavioural field is `businessModel` — a free-text string.
The `scale` axis in `scoreDriftVector` (`packages/core/src/drift/score.ts`) simply
aggregates scale-tagged signals; nothing is ever compared against an expected
volume or geography. So a $250M on-chain treasury move scores the same whether the
customer is a corner shop or a sovereign fund.

This is both a **data gap** (no expected-volume field) and a **logic gap** (no
contextualisation). We close both: add a structured `expectedActivity` profile to
the baseline, and let a signal that breaches expectations get a **bounded boost**
to the relevant axis, with the breach made visible in the UI.

Scope is **approach B** (display + explain + scoring contribution): bounded,
additive, opt-in. It does not rewrite the tuned scale scoring (approach C).

## 1. Schema — `packages/core/src/schemas/baseline.ts`

A reusable numeric band and an expected-activity profile:

```ts
/** A numeric expectation band [min, max] in some unit. */
export const BandSchema = z
  .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
  .refine((b) => b.max >= b.min, "max must be >= min");
export type Band = z.infer<typeof BandSchema>;

/** Expected activity/transaction profile captured at onboarding (Layer 2). */
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

Added to `KYCBaselineSchema` as `expectedActivity: ExpectedActivitySchema.optional()`.
**Optional** so existing baselines parse unchanged and entities without it score
exactly as today.

## 2. Data — `data/baselines/*.json`

Populate `expectedActivity` for the demo showcase entities:

- **strategy** (MicroStrategy) — software-company profile:
  modest `annualVolumeUsd` (e.g. $50M–$300M), `typicalTxnUsd` $10K–$5M,
  channels `["enterprise licensing","cloud subscriptions","support contracts"]`,
  geos `["US","GB","DE","CH","CA","AU"]`. The $250M BTC treasury move (chain) and
  $500M financing (market) then visibly **breach** the typical-txn band.
- **gulf-bridge-capital** — Gulf trade-finance profile:
  geos `["AE","SA","KW","QA"]`, conventional banking channels. The OFAC / Iran (IR)
  / sanctioned-controller signals **breach** expected geographies; the mixer/darknet
  on-chain exposure breaches expected channels.

Other baselines are left without `expectedActivity` (graceful no-op — proves the
optional path).

## 3. Logic — new `packages/core/src/drift/expectation.ts`

Pure, dependency-light helpers:

```ts
/** USD magnitude carried by a signal's payload, or null. */
export function signalMagnitudeUsd(s: Signal): number | null;
// amountUsd ?? valuationUsd ?? magnitudeUsd, coerced to a finite number

/** Counterparty geos a signal implies (ISO-2), e.g. regulator country. */
export function signalGeographies(s: Signal): string[];

/** A breach of the expected profile, or null when within expectations. */
export function expectationBreach(
  s: Signal,
  expected: ExpectedActivity | undefined,
): { kind: "volume" | "geo"; ratio?: number; detail: string } | null;

/** Bounded multiplier in [1, 1.5] applied to a breaching signal's weight. */
export function expectationBoost(
  s: Signal,
  expected: ExpectedActivity | undefined,
  axis: DriftAxis,
): number;
```

Rules:

- **No `expectedActivity` → boost `1`** (everything behaves as today).
- **Volume breach** applies only on the `scale` axis: when `signalMagnitudeUsd`
  exceeds `typicalTxnUsd.max` (falling back to `annualVolumeUsd.max`), the boost is
  `1 + min(0.5, k · log10(ratio))` with `ratio = magnitude / band.max`, `k` chosen
  so a ~10× breach ≈ +0.25 and the boost saturates at **1.5**.
- **Geo breach** applies only on the `jurisdiction` axis: a counterparty geo not in
  `counterpartyGeographies` (and the list is non-empty) → fixed boost `1.3`.
- `expectationBreach` returns a human string for the reasoning/UI, e.g.
  `"~50× typical txn ($250.0M vs $5.0M)"` or `"counterparty geo IR not expected"`.

Threading:

- `scoreAxis(signals, asOf, opts?)` gains an optional
  `opts: { expected?: ExpectedActivity; axis?: DriftAxis }`. When present, each
  signal's weighted term is multiplied by `expectationBoost(s, expected, axis)`.
  Breach details are appended to the axis `reasoning`.
- `scoreDriftVector` passes `baseline.expectedActivity` and the axis key down to
  each `scoreAxis` call. No schema or other-stage changes.

Because the boost is bounded `[1, 1.5]` and multiplies only **breaching** signals,
non-breaching signals and entities without expectations are unaffected; tuned
scores shift only where a real breach exists.

## 4. UI

- **`CompanyDetail.svelte`** — an "Expected activity" block (annual band, typical
  txn, channels, geos), rendered only when `expectedActivity` is present.
- **`EventsView.svelte`** — breaching rows append a concise note in the existing
  **Market research** column (e.g. `· ⚠ ~50× typical txn`) via a thin
  `deriveExpectationNote(s, expectedActivity)` helper in `view.ts`. The helper
  mirrors `expectationBreach`'s detail string for the web layer.
- The `scale` / `jurisdiction` axis reasoning already surfaced in
  `AxisBreakdown.svelte` now reflects the boosted score and breach text — that is
  the visible "narrow down".

## 5. Testing (TDD)

- `packages/core/src/drift/expectation.test.ts`
  - `signalMagnitudeUsd` extraction across payload shapes; null when absent.
  - `expectationBreach`: magnitude over/under band; expected vs unexpected geo;
    null when `expected` undefined.
  - `expectationBoost`: returns `1` with no expectations / no breach; a ~10× volume
    breach ≈ 1.25; saturates at `1.5`; geo mismatch = `1.3`; only on the matching
    axis.
- `packages/core/src/drift/score.test.ts`
  - A breaching `scale` signal yields a strictly higher axis score *with*
    `expectedActivity` than without; a within-band signal is unchanged.
- `packages/core/src/schemas/baseline.test.ts`
  - `expectedActivity` parses; `BandSchema` rejects `max < min`; baseline without
    `expectedActivity` still parses.

## Non-goals

- No rewrite of the scale aggregation model (approach C).
- No new payload fields on signals; magnitude/geo are read from existing payloads.
- No LLM-tier prompt changes in this slice (the bounded score boost + UI breach
  note already deliver the contextualisation; stage-2 prompt enrichment can follow
  later).
