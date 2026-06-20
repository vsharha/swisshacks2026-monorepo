# Algorithm Pipeline

The live risk-analysis pipeline behind the KYC-Drift Monitor. It takes normalized
public signals about a customer book, scores each customer's drift cheaply and
deterministically, and escalates to LLM reasoning **only** on the axes — and the
entities — that actually moved.

> See `product.md` for the drift model and scenario, `techstack.md` for the cost
> architecture and the `Signal` seam. This doc describes the implementation in
> `@kyc/core` and how it's invoked from `apps/web`. Candidate enhancements —
> accepted and refused — live in `pipeline-proposals.md`.

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
   `Signal` contract: `{ id, entityId, axis, type, date, sourceUrl, title, source,
   payload, confidence }`. This is the canonical seam — every downstream stage
   consumes it. See [Sources & ingestion](#sources--ingestion) below.

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

### Relationship graph & propagation

A small relationship layer (`packages/core/src/graph/`) sits beside the cascade
(proposals 3 + 5). `buildGraph` derives a typed graph from the book — entities,
the people and vehicles that own or control them, and the countries they touch as
**nodes**; `OWNS` / `CONTROLS` / `INVESTED_IN` / `BOARD_MEMBER_OF` / `OPERATES_IN`
as **edges** — plus registry-style links the baselines can't express on their own
(`data/reference/ownership-links.json`). Because a shared owner appears once, two
entities with a common controller are connected.

Walking it (`graph/walk.ts`) yields two products, both emitted as **ordinary
`Signal`s** so Stage 0/1/2/3 consume them unchanged:

- **Graph-risk enricher** (`pipeline/enrichers/graph.ts`, proposal 3): from an
  entity, find risk reached through a **chain** of ≥2 hops (a sanctioned
  controller behind a nominee, a high-risk affiliate) and emit an `ownership`
  `graph_exposure` signal with the relationship path. One-hop reach is the static
  screen's job (proposal 6); this is the hidden-controller case it cannot see.
- **Propagation** (`pipeline/propagate.ts`, proposal 5): when a drift is
  *confirmed* on entity A (e.g. a direct sanctioned owner), emit cheap
  `propagated_risk` re-trigger signals on A's customer neighbours, reaching
  entities **beyond** the static window — so a confirmed entity moves the
  customers it shares an owner or director with, even ones with no risk of their
  own. The static enricher is deliberately bounded to 1st/2nd-degree; propagation
  is what carries a *confirmed* drift further.

Graph signals carry the `RelationshipPath` in their payload; Stage 3 lifts those
onto the `Alert.relationshipPaths` field as citable, first-class explainability.
Graph-derived signals use the `graph` source (a deliberately softer
`SOURCE_QUALITY` prior of 0.70 — inference, not a primary list hit), with
per-hop confidence decay. The offline `@kyc/scripts/graph.ts` builds the book
graph, runs **both** passes and writes `data/signals/<entity>.graph.json`;
`loadBook` picks them up like any source. Two demo threads off Gulf Bridge
Capital (which has a directly OFAC-sanctioned investor): **NordTrade Holding**'s
nominee parent (Caspian Holdings) is controlled by that same investor, so
NordTrade inherits ownership exposure through a two-hop chain with no adverse news
of its own (proposal 3); and **Baltic Pay**, which shares only a *clean* director
with Gulf Bridge, receives a propagated re-trigger once Gulf Bridge's drift is
confirmed (proposal 5) — risk the static scan deliberately doesn't reach.

### Sources & ingestion

The connectors are framework-agnostic: they take `apiKey` / `userAgent` as
arguments and never read `process.env`, so the **same code powers two callers
without leaking each other's config** — offline extraction (`@kyc/scripts`,
`extract/*.ts` → versioned JSON in `data/`) and the live SvelteKit routes (same
functions, runtime key).

| Source | Connector | Covers | Limits |
|---|---|---|---|
| **EventRegistry** | `eventRegistry.ts` | Entity-resolved news, sentiment, event-cluster dedup | Provided key reaches **~last 30 days** only; English-first; 100 articles/call |
| **SEC EDGAR** | `secEdgar.ts` | Ground-truth structural filings (8-K rename/asset-sale/financing, delisting) | **US public companies only**; free + permanent |

EventRegistry is the recent adverse-media texture; SEC EDGAR is the permanent
structural spine (the split exists because the provided ER key can't reach
history). A signal is built in five steps, with two non-obvious behaviors worth
knowing:

1. **Resolve** — ER `suggestConcept` maps a name → `conceptUri`; SEC uses a CIK.
2. **Fetch** — `fetchArticlesWindowed` splits the range into day-windows (so the
   100-article-per-call cap never silently truncates older events).
3. **Classify** — `stage0.classifyAxis` (news regex) or `classifyFiling` (8-K
   item-code → axis map) routes each item to an axis with a confidence.
4. **Normalize + validate** — records are `safeParse`d; **failures are dropped,
   not thrown**, so one bad URL never aborts a batch.
5. **Dedup** — `dedupeSignals` collapses signals describing the same event into
   one and records `clusterSize` (the cost lever), clustering **across** sources
   by `eventUri`, `sourceUrl` or a normalized-title fingerprint and keeping the
   highest-confidence representative. `dedupeByEvent` is retained as a back-compat
   alias that delegates to it.

**Current ingestion gaps** (these motivate the ingestion proposals in
`pipeline-proposals.md`): structural coverage is **US-public-only**; there are
**no sanctions / registry / ownership sources**; dedup is **intra-EventRegistry
only** (an 8-K and the news reporting it don't collapse); and ingestion is
**stateless** — every run is a full re-pull rather than an incremental, watermarked
fetch.

### Core files

- `packages/core/src/schemas/` — Zod contracts: `Signal`, `KYCBaseline`,
  `DriftVector`/`AxisDrift`, `Alert`, audit entries
- `packages/core/src/pipeline/stage0.ts` — keyword axis routing
- `packages/core/src/drift/score.ts` — Stage 1 scoring + `AXIS_WEIGHTS`, thresholds
- `packages/core/src/graph/` — relationship graph: `buildGraph`, walk, hidden-controller paths
- `packages/core/src/pipeline/enrichers/graph.ts` — graph-risk enricher (proposal 3)
- `packages/core/src/pipeline/propagate.ts` — risk propagation re-trigger (proposal 5)
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

## Judging-criteria alignment

The pipeline is built to hit the rubric, not just a raw score:

| Criterion | Weight | How the pipeline hits it |
|---|---|---|
| AI Intelligence Quality | 25% | 5-axis drift reasoning + pattern-match outcome priors; per-axis verdicts |
| Cost Efficiency | 20% | Tiered cascade; live per-stage token/$ accounting; (proposed) delta-triggered escalation |
| UX & Explainability | 20% | Per-axis drift vector, citations, human-readable alerts |
| Compliance & Safety | 20% | Zod guardrails, citations, HITL gate, audit log; (proposed) richer confidence engine |
| Engineering & Architecture | 15% | Modular stages, one-connector-two-callers seam, shared Zod schemas |

## Notes

The cascade is intentionally modular so each stage can be improved independently.
Candidate enhancements — accepted and refused, all scoped to land on the existing
`Signal` seam and 5-axis model — are tracked in `pipeline-proposals.md`.
