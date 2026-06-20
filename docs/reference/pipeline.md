# Algorithm Pipeline

The live risk-analysis pipeline behind the KYC-Drift Monitor. It takes normalized
public signals about a customer book, scores each customer's drift cheaply and
deterministically, and escalates to LLM reasoning **only** on the axes — and the
entities — that actually moved.

> See `product.md` for the drift model and scenario, `techstack.md` for the cost
> architecture and the `Signal` seam. This doc describes the implementation in
> `@kyc/core` and how it's invoked from `apps/web`.

This document is split into two parts: **[As built](#as-built)** — the current
TypeScript cascade — and **[Proposed additions](#proposed-additions)** — enhancements
that layer onto that base without replacing it.

## As built

The pipeline is a **tiered rule → LLM cascade over a 5-axis drift model**. Every
stage reads and writes the same canonical `Signal` shape, so offline scripts and
the live app share one code path (see `techstack.md`, "one connector layer, two
callers").

### The drift axes

Risk is decomposed by **drift axis**, not by data domain. Five axes, each scored
independently and combined into a weighted composite:

`business_model` · `ownership` · `scale` · `reputation` · `jurisdiction`

### Stages

1. **Ingestion → `Signal`** (`packages/core/src/connectors/`)
   Connectors (EventRegistry, SEC EDGAR, …) normalize raw records into the Zod
   `Signal` contract: `{ entityId, axis, type, date, sourceUrl, title, payload,
   confidence }`. This is the canonical seam — every downstream stage consumes it.

2. **Stage 0 — deterministic axis routing** (`packages/core/src/pipeline/stage0.ts`)
   `classifyAxis(text)` routes a headline to a drift axis by keyword/regex rules
   (rename → `business_model`, takeover → `ownership`, financing → `scale`,
   reincorporation → `jurisdiction`, SEC/litigation → `reputation`). No LLM.

3. **Stage 1 — cheap-tier drift scoring** (`packages/core/src/drift/score.ts`)
   `scoreDriftVector(baseline, signals, { asOf })` aggregates the signals on each
   axis into a `[0,1]` score, deterministically and for ~free:
   - **recency decay** (365-day half-life), **cluster bonus** for same-event
     signals, **saturation** so evidence converges to 1.
   - a weighted **composite** across axes (`AXIS_WEIGHTS`, sums to 1).
   - `asOf` makes drift a function of time, so the demo clock accumulates drift
     axis-by-axis. This tier absorbs the ~99% of the book that hasn't moved.
   - thresholds: composite `>= 0.7` → `alert`, `>= 0.4` → `watch`, else `stable`.

4. **Stage 2 — per-axis materiality (LLM, cheap)** (`packages/core/src/pipeline/stage2.ts`)
   `reasonAxisMateriality(...)` fires **only on drifting axes** (status ≠ stable).
   Claude Haiku judges whether the drift is genuine enough to invalidate the KYC
   baseline; returns a Zod-validated `{ score, confidence, verdict, reasoning }`.

5. **Stage 3 — synthesis + pattern match (LLM, expensive)** (`packages/core/src/pipeline/stage3.ts`)
   `synthesizeAlert(...)` fires **only if composite crossed the alert threshold**.
   Claude Sonnet drafts a recommended action, matches the drift signature against
   the pattern library (e.g. Long Blockchain 2017) for an outcome prior, and emits
   a Zod `Alert` with ≥1 required citation — citations restricted to supplied
   evidence (hallucination guardrail).

6. **Escalation + cost accounting** (`packages/core/src/pipeline/escalate.ts`)
   `runEscalation(...)` orchestrates Stage 1 → conditional Stage 2 → conditional
   Stage 3 and tallies tokens + USD per model, so cost scales with *change*, not
   book size.

7. **Output, audit, HITL** (`apps/web/src/lib/server/analyze.ts`, `routes/+page.*`)
   The dashboard renders the per-axis drift vector, the alert, citations and the
   live cost funnel. Stage verdicts, escalation decisions, the alert and the
   analyst's escalate/dismiss decision all append to the audit log.

### Core files

- `packages/core/src/schemas/` — Zod contracts: `Signal`, `KYCBaseline`,
  `DriftVector`/`AxisDrift`, `Alert`, audit entries
- `packages/core/src/pipeline/stage0.ts` — keyword axis routing
- `packages/core/src/drift/score.ts` — Stage 1 scoring + `AXIS_WEIGHTS`, thresholds
- `packages/core/src/pipeline/stage2.ts` — per-axis LLM materiality (Haiku)
- `packages/core/src/pipeline/stage3.ts` — alert synthesis + pattern match (Sonnet)
- `packages/core/src/pipeline/escalate.ts` — cascade orchestration + cost tally
- `packages/core/src/llm/config.ts` — model selection + per-token pricing
- `apps/web/src/lib/server/analyze.ts` — server-side escalation wrapper + audit log

### Example flow

Advance the clock → Stage 0 routes the day's signals → Stage 1 rescoring lights up
the moved axes → Stage 2 reasons on those axes → composite crosses 0.7 → Stage 3
synthesizes the RE-KYC alert with a pattern match → analyst escalates/dismisses at
the HITL gate → every step is logged with its token cost.

## Proposed additions

Five enhancements that strengthen the existing cascade. Each is **additive**: it
reuses the `Signal` seam and the 5-axis model, and slots into a named stage above
rather than replacing it.

### 1. Confidence engine

**Now:** `scoreAxis` sets an axis's `confidence` to the *max* of its signals'
confidences — a single-signal proxy with no notion of corroboration.

**Add:** a `confidenceForAxis(signals)` helper that scores confidence as an
explicit weighted blend (formula from `datastructure.md`):

```text
confidence = 0.40 · source quality
           + 0.25 · corroboration       (independent sources agreeing)
           + 0.20 · freshness           (recency of the evidence)
           + 0.15 · historical accuracy
```

**Source quality** is a per-connector prior keyed on the `source` field the
connectors already set — e.g. `opensanctions`/`sec_edgar`/`gleif` ≈ 0.95+,
EventRegistry adverse media ≈ 0.6–0.9, `manual`/social ≈ 0.5–0.8. Writes the
existing `AxisDrift.confidence` field; changes no schemas. Keeps risk and
confidence separate (a high-confidence signal can still be low-risk) and directly
strengthens the "confidence on every claim" guardrail.

### 2. Change-triggered (delta) alerting

**Now:** Stage 3 fires only on an *absolute* composite `>= 0.7`.

**Add:** also escalate when the composite **jumps** by a configured delta since the
last `drift_evaluated` audit entry, even below the absolute threshold. This makes
techstack.md's *change-triggered evaluation* thesis literally true in code — a
stable customer that suddenly moves is caught on the delta, not just the level.
Slots into the escalation gate (`pipeline/escalate.ts`) reading prior state from
the audit log. Additive to `statusForScore`, not a replacement.

### 3. Knowledge graph / graph-risk signal

**Now:** baselines list beneficial owners, but nothing walks the relationships;
the `ownership` axis sees only news about the entity itself.

**Add:** a small relationship layer (derivable from baselines + EventRegistry
co-mentions) where entities, individuals, investors and countries are **nodes** and
edges are typed — `OWNS`, `CONTROLS`, `INVESTED_IN`, `OPERATES_IN`,
`BOARD_MEMBER_OF` (vocabulary from `datastructure.md`). Walking it yields
1st/2nd/3rd-degree exposure and **hidden-controller detection**, emitting an
**ownership-axis enricher `Signal`** when risk reaches an entity through a chain
(e.g. the Wirecard-modeled entity's shadow ownership / offshore investors). Output
is a normal `Signal`, so Stage 0/1/2 consume it unchanged — it enriches the axis,
it does not replace signals.

The graph also lets **Stage 3 attach a relationship path** to the `Alert` — the
edge chain that produced the risk (`entity → UBO → sanctioned party`) — as
first-class, citable explainability, and powers a dashboard graph view.

### 4. Geopolitical + regulatory enrichers

**Now:** Stage 0 keyword-routes jurisdiction and reputation signals, but there's no
country-risk or regulatory-action lookup.

**Add:** cheap deterministic enrichers — a country-risk list feeding the
`jurisdiction` axis and a sanctions/litigation lookup feeding `reputation` — each
emitting `Signal`s with their own `confidence`. Pure Stage 0/1, no LLM, reusing the
canonical seam. Keeps the funnel numbers real without adding LLM cost.

### 5. Graph propagation as a re-trigger

**Now:** each entity is scored as an isolated linear pass; a drift on one customer
never touches another.

**Add:** when Stage 2/3 *confirms* a drift on entity A, enqueue cheap Stage 1
re-scoring of A's graph neighbours (proposal 3). This is the one change that alters
the pipeline's *shape* rather than enriching a stage: risk propagates along
relationships, so a sanctioned new owner moves every entity that owner controls —
even those with no news of their own. It extends, rather than replaces, the
change-triggered model: a confirmed drift simply becomes a propagation trigger. The
neighbour re-scores stay in the cheap tier, so propagation is near-free; only a
neighbour that itself crosses a threshold escalates.

## Judging-criteria alignment

The pipeline is built to hit the rubric, not just a raw score:

| Criterion | Weight | How the pipeline hits it |
|---|---|---|
| AI Intelligence Quality | 25% | 5-axis drift reasoning + pattern-match outcome priors; per-axis verdicts |
| Cost Efficiency | 20% | Tiered cascade; live per-stage token/$ accounting; (proposed) delta-triggered escalation |
| UX & Explainability | 20% | Per-axis drift vector, citations, human-readable alerts |
| Compliance & Safety | 20% | Zod guardrails, citations, HITL gate, audit log; (proposed) richer confidence engine |
| Engineering & Architecture | 15% | Modular stages, one-connector-two-callers seam, shared Zod schemas |

## Rejected / out of scope

Ideas weighed from the source material and deliberately **not** folded into the
cascade, with the reason.

**From the original generic-batch pipeline draft:**

- **Six parallel domain risk models** (entity / graph / behavioral / event /
  regulatory / geopolitical) as the organizing *structure* — the cascade organizes
  risk by **drift axis**, which fits the change-from-baseline thesis. Only graph,
  geo and regulatory survived, and only as *evidence feeding existing axes*.
- **A single composite `final_score` per company** as the primary output — the
  per-axis drift vector is the intelligence *and* the dashboard; collapsing it to
  one number loses the explainability.
- **Self-reported "judging-criteria scores" computed inside the pipeline** — a
  presentation artifact, not a risk signal; it belongs in the pitch, not the engine.

**From `datastructure.md` (the intelligence-layer vision):**

- **The 9 static risk *dimensions*** replacing the 5 drift axes — a different mental
  model (static risk vs. change-from-baseline), not a superset. Kept the axes.
- **The reshaped `Signal`** (`signalType` / `riskDimension` / `timestamp` /
  `severity` / `metadata`) — renaming the canonical seam is a breaking change that
  ripples through every stage; the additions above need none of it.
- **Twice-daily batch schedule (08:00 / 20:00 UTC)** — *more* rigid than the
  change-triggered + time-scrubber runtime; adopting it would undercut the cost story.
- **Crypto-native / blockchain and social (LinkedIn) intelligence** — beyond the
  hero-entity demo scope, with no source wired for them.

## Notes

The cascade is intentionally modular so each stage can be improved independently.
The proposed additions are scoped to land on the existing `Signal` seam and 5-axis
model — they extend the current implementation rather than fork it.
