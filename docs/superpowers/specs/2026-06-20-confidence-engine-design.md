# Confidence Engine — Design

Implements **Proposal 1** from `docs/reference/pipeline-proposals.md`: replace the
single-signal confidence proxy in cheap-tier drift scoring with an explicit
weighted blend, so every axis confidence reflects source quality, corroboration,
and recency rather than just "the max confidence of any one signal."

## Goal

Today `scoreAxis` (`packages/core/src/drift/score.ts`) sets an axis's
`AxisDrift.confidence` to `Math.max(...signal.confidence)` — a single-signal proxy
with no notion of corroboration or freshness. Replace it with a pure
`confidenceForAxis(signals, asOf)` helper computing the `datastructure.md` blend.

This **changes no schemas, no callers, and no other stages** — it writes the same
`AxisDrift.confidence` field. Risk and confidence stay separate (a high-confidence
signal can still be low-risk).

## The function

```ts
export function confidenceForAxis(signals: Signal[], asOf: string): number
```

Returns a value in `[0, 1]` (clamped) from four terms, each in `[0, 1]`, with
weights that sum to 1:

```
confidence = 0.40 · sourceQuality
           + 0.25 · corroboration
           + 0.20 · freshness
           + 0.15 · historicalAccuracy
```

| Term | Weight | Computation (all from fields that already exist on `Signal`) |
|---|---|---|
| **sourceQuality** | 0.40 | `max` over the axis's signals of `SOURCE_QUALITY[signal.source]` — the strongest provenance backing the axis |
| **corroboration** | 0.25 | `1 − 0.5^(distinctUrls − 1)`, where `distinctUrls` = count of distinct `signal.sourceUrl`. 1 article → 0, 2 → 0.5, 3 → 0.75 |
| **freshness** | 0.20 | `recencyWeight(freshestDate, asOf)` — reuses the existing function in `score.ts` (`0.5^(ageDays/365)`) on the most recent signal |
| **historicalAccuracy** | 0.15 | `HISTORICAL_ACCURACY_STUB` (a flat `0.75`), commented as stubbed until Proposal 13 supplies real outcome data |

Empty signal list → returns `0` (matches the current empty-axis branch).

### Source-quality priors

Exhaustive over the `Source` enum (`packages/core/src/schemas/common.ts`), so the
`Record<Source, number>` is total and the lookup can never be `undefined`:

```ts
const SOURCE_QUALITY: Record<Source, number> = {
  sec_edgar: 0.97,      // regulator filings
  gleif: 0.96,          // LEI registry
  opensanctions: 0.95,  // sanctions/PEP lists
  opencorporates: 0.85, // corporate registry aggregator
  wayback: 0.80,        // archived primary source
  eventregistry: 0.75,  // adverse media, mid-trust
  manual: 0.60,         // analyst-entered
};
```

### Why these decisions

- **Corroboration counts distinct `sourceUrl`** (independent articles), not distinct
  `source` connectors. With only two connectors wired today, connector-count would
  pin most axes at ~0; article-count gives a meaningful signal now and still rises
  as new sources land.
- **historicalAccuracy is a flat constant, not a per-source map.** With no outcome
  track record yet, a per-source "accuracy" prior would just mirror source quality
  and silently double-weight it. A flat constant keeps the documented 4-term shape
  intact and is a one-line swap when Proposal 13 (the MCP outcome-feedback loop)
  provides real data. It adds a fixed offset, so it does **not** change the relative
  ordering of confidences across signals — only the absolute band.

## Wiring

In `scoreAxis`, replace the `maxConfidence` accumulation and the
`confidence: maxConfidence` assignment with `confidence: confidenceForAxis(sorted, asOf)`.
`sorted` is already newest-first in that function, and `asOf` is already in scope.
Nothing else in `score.ts`, `escalate.ts`, or the stages changes.

## Testing

`confidenceForAxis` is a pure function — unit-test in isolation:

- empty signals → `0`
- single SEC signal, fresh → `0.40·0.97 + 0.25·0 + 0.20·~1 + 0.15·0.75 ≈ 0.70`
- single SEC signal, ~1 year stale → freshness ≈ 0.5, lower total
- two independent articles same source → corroboration `0.5`
- mixed `sec_edgar` + `eventregistry` → sourceQuality picks `0.97`
- result always within `[0, 1]`

## Validation against real data

After wiring, re-run `score:drift` on the two real heroes (`smartbird`, `strategy`)
and confirm the confidences move in defensible directions: axes carrying SEC
filings stay high (~0.95+ sourceQuality), news-only axes with a single article sit
lower, and well-corroborated recent axes stay near the top. This is a sanity check,
not an assertion — the demo book is the test fixture.

## Out of scope

- Populating `historicalAccuracy` with real outcomes — that is **Proposal 13**.
- Per-claim confidence on signals themselves — unchanged; this is axis-level only.
- Any schema, caller, or stage change.
```
