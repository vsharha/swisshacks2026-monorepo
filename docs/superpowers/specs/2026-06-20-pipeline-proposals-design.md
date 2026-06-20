# Pipeline Proposals — Implementation Design

Implements all 14 accepted proposals in `docs/reference/pipeline-proposals.md`, layered
onto the existing `Signal` seam and 5-axis drift model. Nothing forks the cascade; every
unit slots into a named stage and produces canonical `Signal`s or writes an existing schema
field.

> Source of truth for behaviour: `docs/reference/pipeline-proposals.md` (the 14 proposals)
> and `docs/reference/pipeline.md` (the as-built cascade). This doc says *how* each lands in
> code, in dependency order, with file targets and tests.

## Guiding constraints

1. **Additive only.** The 5-axis model and the canonical `Signal` shape are fixed. The only
   schema changes are three optional field/enum additions (Phase 0). Every existing call site
   compiles unchanged.
2. **The live demo runs on versioned `data/` JSON.** `apps/web` reads pre-extracted
   `data/signals/*.json` and `data/baselines/*.json`; it never calls a connector. So:
   - Proposals **1, 2, 3, 4, 5, 6, 9** touch the live scoring/escalation path and are visible
     in the running app.
   - Proposals **7, 8, 10, 11, 12, 13, 14** are ingestion-layer — they run only in
     `@kyc/scripts` offline extraction and change *what JSON gets produced*. To make their
     output visible in the demo, their `Signal`s land in `data/` fixtures (see "Demo
     visibility" below).
3. **Connectors stay framework-agnostic** — take `apiKey`/`userAgent` as args, never read
   `process.env` (the "one connector layer, two callers" rule).
4. **No external credentials exist in this repo.** Tier-D connectors (8, 12, 13, 14) ship as
   real typed signatures that normalize **bundled sample fixtures** into genuine `Signal`s;
   when asked to hit a live network without a key they return empty and log
   `"set <X>_API_KEY"`. Nothing fake-passes as a live fetch.

## Decisions locked in this design

- **Source enum (compact).** Add to `SourceSchema`: `rss`, `regulator` (specific body in
  `payload.body`), `companies_house`, `zefix`, `market`, `chain`, `internal`. Reuse existing
  `gleif` / `opensanctions` / `opencorporates`.
- **Tier-D scaffold convention:** bundled sample fixture → real `Signal`s by default; empty +
  log on missing live key. `pnpm check` stays green; Stage 0–3 consume the sample signals
  end-to-end.
- **Demo entity (target-geography):** the book has US (`smartbird`, `strategy`) and CH/DE
  entities but **no UAE entity**, despite UAE being half the target market. So add **one new
  UAE-domiciled entity** (ADGM/DFSA free-zone holding) as the screening/graph hero, and wire a
  graph edge from it to a US entity so propagation (5) crosses UAE → US. This lands every
  geography-sensitive feature — DFSA/ADGM regulators (12), FATF country risk (4/6), screening
  (6), graph (3), propagation (5) — squarely in the UAE + America target market. NordTrade and
  the other baselines stay untouched as ordinary book members. (`strategy`/MicroStrategy, US,
  already demonstrates the crypto-treasury case for 14.2.)

---

## Phase 0 — Shared contracts & static data

These land first; every later phase builds on them.

### 0.1 `SOURCE_QUALITY` priors — `packages/core/src/drift/confidence.ts` (new)

A per-`source` prior in `[0,1]`, the spine of proposal 1 and reused by every new connector:

```ts
export const SOURCE_QUALITY: Record<Source, number> = {
  opensanctions: 0.97, gleif: 0.95, sec_edgar: 0.95, companies_house: 0.93,
  zefix: 0.93, regulator: 0.92, internal: 0.9, opencorporates: 0.85,
  market: 0.8, chain: 0.75, wayback: 0.7, eventregistry: 0.7, rss: 0.6, manual: 0.6,
};
```

### 0.2 Schema additions (the only contract changes)

- `BeneficialOwnerSchema` (`schemas/baseline.ts`): add optional `nationality` (ISO country
  code, validated against the ISO-3166 set used by the country-risk list). — **proposal 6**
- `SourceSchema` (`schemas/common.ts`): add the seven enum values above. — **6, 7, 12, 13, 14**
- `AlertSchema` (`schemas/alert.ts`): add optional `relationshipPath?: RelationshipPathSchema`
  — an ordered edge chain (`entity → UBO → sanctioned party`) for explainability. — **proposal 3**

All additive and optional; existing fixtures stay valid.

### 0.3 Static data files (`data/reference/`, new)

- `fatf-country-risk.json` — ISO country → `{ risk: "high" | "increased" | "standard",
  reason, source }`, modelling the FATF black/grey lists + a high-risk prior. — **4, 6, 12**
- `sanctions-sample.json` — sample OpenSanctions/PEP entries (names + aliases + list +
  country) used by the screening connector's fixture mode. — **6, 12**

---

## Phase 1 — Tier A: pure logic on the live path

Fully unit-tested, zero new dependencies.

### Proposal 1 — Confidence engine

- **Where:** `confidenceForAxis(signals)` in `drift/confidence.ts`; called from `scoreAxis`
  in `drift/score.ts`, replacing `maxConfidence`.
- **Formula:** `0.40·sourceQuality + 0.25·corroboration + 0.20·freshness + 0.15·historicalAccuracy`.
  - *sourceQuality* = max `SOURCE_QUALITY[s.source]` across the axis's signals.
  - *corroboration* = fraction toward "≥N independent sources agree" (distinct `source`
    values, saturating ~3).
  - *freshness* = recency-weighted (reuse the existing 365-day half-life curve).
  - *historicalAccuracy* = **fixed per-source prior** (stubbed constant, documented) until the
    outcome-feedback loop (proposal 13) populates it. The slot is named, not dropped.
- **Schema impact:** none — writes the existing `AxisDrift.confidence`. Risk and confidence
  stay separate.
- **Tests:** weighted blend math; corroboration rises with distinct sources; single
  low-quality source yields lower confidence than the old max-of behaviour.

### Proposal 2 — Change-triggered (delta) alerting

- **Where:** `escalate.ts` + `apps/web/.../analyze.ts`.
- **Change:** add optional `priorComposite?: number` to `RunEscalationParams`. The Stage-3
  gate widens from `drift.status === "alert"` to
  `drift.status === "alert" || (priorComposite !== undefined && drift.composite - priorComposite >= DELTA)`
  (`DELTA` const, ~0.15). When omitted, behaviour is byte-for-byte the current gate.
- **Caller owns the log:** `analyze.ts` reads the previous `drift_evaluated` *composite* entry
  from the audit log and passes it in; `runEscalation` stays side-effect-free.
- **Audit reason string** distinguishes level-cross vs delta-cross escalation.
- **Tests:** stable→jump escalates below 0.7 on delta; omitted field = unchanged gate;
  level-cross still escalates.

### Proposal 9 — Cross-source dedup + fingerprint key

- **Where:** generalize `dedupeByEvent` → `dedupeSignals` in `connectors/dedup.ts` (new;
  `eventRegistry.ts` re-exports for back-compat).
- **Change:** cluster key falls back `eventUri → sourceUrl → md5(normalizedText)` where
  normalized = lowercased, punctuation-stripped first ~1k chars of `title + payload.body`.
  Cluster **across** sources; keep the **highest-confidence** representative (not earliest) so
  an 8-K and the article reporting it collapse to the regulator-grade signal.
- **Tests:** an 8-K + matching news article collapse; `clusterSize` accumulates; distinct
  events stay separate.

---

## Phase 2 — Tier B: internal subsystems from existing data

Deterministic, tested, no external calls (use Phase-0 static data + baselines + ER co-mentions).

### Proposal 4 — Geopolitical + regulatory enrichers

- **Where:** `pipeline/enrichers/geo.ts`, `pipeline/enrichers/regulatory.ts` (new). Pure
  Stage-0/1, no LLM.
- **Behaviour:** `countryRiskSignals(baseline)` reads `fatf-country-risk.json` and emits a
  `jurisdiction` `Signal` when the domicile is high/increased risk;
  `regulatoryActionSignals(baseline, ...)` emits a `reputation` `Signal` for a
  sanctions/litigation match. Each carries its own confidence (via `SOURCE_QUALITY`).
- **Tests:** high-risk domicile emits a jurisdiction signal; standard domicile emits none.

### Proposal 6 — Static screening (owner/management sanctions + country risk)

- **Where:** `connectors/opensanctions.ts` (new, also used by 12.2) + `pipeline/screen.ts`
  (new). Deterministic, run at baseline build and re-run when ownership drifts.
- **Three checks:**
  1. Person-level country-of-origin via the new optional `BeneficialOwner.nationality`.
  2. Sanctions/PEP match of every owner, director and the entity name against the
     `opensanctions` connector → high-confidence `Signal` on `ownership` (sanctioned
     controller) or `reputation` (sanctioned/PEP individual).
  3. Country risk: company `jurisdiction` **and** each owner `nationality` vs
     `fatf-country-risk.json` → `jurisdiction` `Signal`.
- **Tests:** sanctioned owner → ownership signal; PEP director → reputation signal; high-risk
  nationality → jurisdiction signal; clean book → no signals.

### Proposal 3 — Knowledge graph / graph-risk signal

- **Where:** `graph/build.ts`, `graph/walk.ts` (new). Nodes: entity, individual, investor,
  country, (later) wallet. Typed edges: `OWNS`, `CONTROLS`, `INVESTED_IN`, `OPERATES_IN`,
  `BOARD_MEMBER_OF`. Built from baselines + ER co-mentions.
- **Output:** an **ownership-axis enricher `Signal`** when risk reaches an entity through a
  chain (hidden-controller / shadow ownership), consumed by Stage 0/1/2 unchanged. Stage 3
  attaches the `relationshipPath` (Phase 0.2) to the `Alert` as citable explainability.
- **Demo:** powers a dashboard graph view (data exposed via `apps/web` server load).
- **Tests:** 2nd/3rd-degree exposure detection; a sanctioned UBO reached through a chain emits
  the ownership signal + a populated path.

### Proposal 5 — Graph propagation as a re-trigger

- **Where:** `escalate.ts` / a thin orchestration helper. Depends on 3.
- **Behaviour:** when Stage 2/3 *confirms* a drift on entity A, enqueue cheap **Stage-1**
  re-scoring of A's graph neighbours; only a neighbour that itself crosses a threshold
  escalates. The one pipeline-shape change; neighbour re-scores stay in the cheap tier so
  propagation is near-free. A screening hit (6) is also a propagation trigger.
- **Tests:** confirmed drift on owner → neighbour re-scored; sub-threshold neighbour does not
  escalate; isolated entity is unaffected.

---

## Phase 3 — Tier C: real offline-extraction infra (`@kyc/scripts`)

Real code; runs offline and needs network at extract time.

### Proposal 7 — RSS news connector

- **Where:** `connectors/rss.ts` (new) + `packages/scripts/src/extract/rss.ts`. New deps:
  `jsdom`, `@mozilla/readability` (+ an RSS parser).
- **Behaviour:** ~40 curated global feeds → `Signal[]` via the **existing** `classifyAxis` and
  `SignalSchema` (`source: "rss"`). Full-text scrape with readability before classification;
  unwrap Google News `batchexecute` redirect links so `sourceUrl` resolves to the real target.
- **Tests:** feed item → valid Signal; Google News redirect unwrap; scrape-failure falls back
  to title+summary, never throws.

### Proposal 10 — Stateful, incremental ingestion

- **Where:** `packages/scripts/src/lib/watermark.ts` (new) + extract scripts. Persist a
  per-entity watermark (last fetched date) and a `seen` set of signal ids under
  `data/state/`; fetch only `since:` the watermark.
- **Tests:** second run with an advanced watermark fetches a narrower window; `seen` ids are
  skipped.

### Proposal 11 — Ingestion hardening

- **Where:** `packages/scripts/src/lib/pool.ts` (new) — bounded concurrency pool with backoff
  (SEC ≤10 req/s + contact `User-Agent`; retry on 429/503). Multilingual classification gating
  in `classifyAxis` (detect language; lean on NER/embedding routing for non-English) once RSS
  lands.
- **Tests:** pool caps concurrency; 429 triggers backoff+retry; rate limiter throttles to ≤10/s.

---

## Phase 4 — Tier D: honest typed scaffolds

Real signatures + bundled sample fixtures + `SOURCE_QUALITY` prior + source enum + documented
key seam. Default mode normalizes a fixture into genuine `Signal`s; live mode without a key
returns empty + logs `"set <X>_API_KEY"`.

### Proposal 12 — Regulatory, sanctions, registry & market connectors

- **Where:** `connectors/regulator.ts`, `connectors/registry.ts` (Companies House/GLEIF/ZEFIX),
  `connectors/market.ts`; sanctions via the `connectors/opensanctions.ts` already built in 6.
- **Axis mapping:** regulators → `reputation` (enforcement/licensing) + `jurisdiction` (FATF
  status); registries → `ownership` (UBO/control) + supply `nationality`/domicile for 6;
  market → `scale` (funding, liquidity, valuation, exchange performance).
- Each reuses classify → normalize → validate; adds its `SOURCE_QUALITY` prior + source enum
  value. Sample fixtures feed `nordtrade-holding`.

### Proposal 8 — Cheap local NER as a Stage-0 entity filter

- **Where:** `pipeline/ner.ts` (new) — typed `tagCompanies(text): EntityMention[]` interface +
  lazy-load seam, gated behind 7. Documents the ~1.5 GB GLiNER `company`-label dependency and
  its disk/cold-start cost. Default impl: a lightweight normalized-form matcher against the
  book (no model) so it runs; the heavy model is the documented opt-in. Matches "Apple" =
  "Apple Inc." by normalized form.

### Proposal 13 — Internal / MCP intelligence — the outcome-feedback loop

- **Where:** `connectors/internal.ts` (new, `source: "internal"`) + wiring in
  `drift/confidence.ts`. Surfaces the bank's own history (past KYC decisions, investigations,
  risk assessments, transaction-monitoring outputs, profile changes) as `Signal`s and as
  `Outcome` audit entries. Transaction-monitoring anomalies route to existing `reputation` /
  `ownership` axes — **no new AML axis**.
- **Closes proposal 1's fourth term:** `historicalAccuracy` is computed from realized
  `Outcome` entries vs past drift verdicts in the audit log, replacing the stubbed constant.
  Confirmed investigations seed the `PatternArchetype` library.
- **Scaffold:** reads a sample internal-history fixture; live MCP mode behind the key seam.

### Proposal 14 — Blockchain / crypto-asset intelligence

- **Where:** `connectors/chain.ts` (new, `source: "chain"`). Crypto = an **asset-exposure
  lens**, not a client type.
  1. Wallet & counterparty screening → `reputation` (illicit-flow proximity) + `ownership`
     (a sanctioned wallet *is* a sanctions hit, composing with 6).
  2. On-chain treasury/flow shift → `business_model` + `scale` (same axes a fiat funding round
     moves — the `strategy`/MicroStrategy hero case).
  3. Graph integration: extend the proposal-3 vocabulary with `Wallet` nodes + a
     `TRANSACTS_WITH` edge, so on-chain exposure propagates via 5.
- **Scaffold:** sample wallet/treasury fixture; live provider behind the key seam.

---

## Demo visibility — new UAE entity (target geography)

Target market is **UAE + America**; the book currently has no UAE entity. To make Tier-B/D
features visible *in-target*, add one new UAE-domiciled baseline rather than enriching the
off-target DE processor:

- **New baseline** `data/baselines/gulf-bridge-capital.json` — an ADGM/DFSA free-zone holding,
  `jurisdiction: "AE"`, with `nationality` on its owners, a layered offshore investor chain,
  and one flagged (sanctioned/PEP) controller. Exercises screening (6), FATF country risk
  (4/6), the graph (3) and the DFSA/ADGM regulator connector (12).
- **Cross-geography graph edge:** a shared investor/owner links the UAE entity to a **US**
  book entity, so a confirmed drift on the UAE entity propagates (5) into the US one —
  demonstrating "drift on one customer touches another" across both target markets.
- **Fixtures** `data/signals/gulf-bridge-capital.*.json` from the Tier-D sample connectors (sanctions
  hit, registry UBO, optional chain/wallet exposure) so the funnel and graph render.
- NordTrade and the other baselines stay untouched; `strategy` (US) already demonstrates the
  crypto-treasury case for 14.2.

## Build order & dependencies

```
Phase 0  (contracts + SOURCE_QUALITY + static data)
   └─ Phase 1  P1, P2, P9          (live-path logic)
   └─ Phase 2  P4, P6 → P3 → P5    (P6 needs opensanctions; P5 needs P3)
   └─ Phase 3  P7 → P10, P11       (P11 multilingual needs P7)
   └─ Phase 4  P12 (uses P6's opensanctions), P8 (gated behind P7),
               P13 (feeds P1's 4th term), P14 (extends P3 graph, composes P5/P6)
```

## Testing strategy

- **Unit (Vitest, in `@kyc/core`):** every Phase-1/2 function (confidence math, delta gate,
  dedup clustering, screening verdicts, graph walk, propagation). Deterministic — no network,
  no LLM.
- **Fixture round-trips:** each Tier-D connector's sample fixture parses to valid `Signal[]`
  and flows through Stage 0→1 without drops.
- **Schema back-compat:** existing `data/` baselines/signals still `parse` after the additive
  schema changes.
- **`pnpm check` / `pnpm lint`** green throughout (run per AGENTS.md before each commit).

## Out of scope / non-goals

- The **refused** proposals in `pipeline-proposals.md` stay refused (9-dimension reshape,
  `Signal` rename, twice-daily batch, social/strategic intelligence, single composite output,
  judging-criteria scores in-pipeline).
- **No real external integrations** — Tier-D connectors are typed scaffolds over sample
  fixtures; wiring live keys/providers is documented but not done.
- The heavy ~1.5 GB GLiNER model (8) is a documented opt-in, not bundled.

## Open questions / risks

- **`regulator` enum vs per-body:** chosen compact (body in `payload.body`); revisit if a
  per-body enum proves clearer downstream.
- **Graph source of edges:** ER co-mention extraction is approximate; baselines provide the
  high-confidence ownership edges, co-mentions the softer ones (lower confidence).
- **Propagation scope (5):** bounded to 1st-degree neighbours per confirmed drift in demo
  scope to keep cost near-zero and avoid cascades.
