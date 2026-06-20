# Pipeline Proposals

Enhancements weighed against the current cascade in `pipeline.md`. Each is judged
on one rule: does it **layer onto the existing `Signal` seam and 5-axis drift
model**, or does it fork them? Accepted proposals are additive; refused ones
replace or conflict with the architecture, or fall outside the demo scope.

> Source material: the original generic-batch pipeline draft and the
> `datastructure.md` intelligence-layer vision. See `pipeline.md` for what is built.

## Accepted proposals

Enhancements that strengthen the existing cascade — proposals 1–6 on the scoring &
escalation path, 7–14 on the ingestion layer (the gaps noted in `pipeline.md`).
Each reuses the `Signal` seam and the 5-axis model, and slots into a named stage
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
EventRegistry adverse media ≈ 0.6–0.9, `manual`/social ≈ 0.5–0.8.

**Historical accuracy** has no live input in demo scope — there is no track record
of past predictions to score against yet — so it is a **fixed per-source prior**
(degenerating into a second source-quality term) until an outcome-feedback loop
exists to populate it. The first three terms carry the signal; the fourth is a
deliberately stubbed constant, not a live input. (Drop-and-renormalise to three
terms is the alternative; keeping the slot named documents the intended shape.)

Writes the existing `AxisDrift.confidence` field; **this proposal changes no
schemas** (a high-confidence signal can still be low-risk — risk and confidence
stay separate), and directly strengthens the "confidence on every claim" guardrail.

### 2. Change-triggered (delta) alerting

**Now:** Stage 3 fires only on an *absolute* composite `>= 0.7`.

**Add:** also escalate when the composite **jumps** by a configured delta since the
last `drift_evaluated` audit entry, even below the absolute threshold. This makes
techstack.md's *change-triggered evaluation* thesis literally true in code — a
stable customer that suddenly moves is caught on the delta, not just the level.

Kept **truly additive** via an **optional `priorComposite?` on `RunEscalationParams`**:
the *caller* owns the audit log (`analyze.ts`), so it reads the previous
`drift_evaluated` composite and passes it in; `runEscalation` stays side-effect-free
and never touches the log itself. The escalation gate then widens from
`drift.status === "alert"` to *that **or** `priorComposite !== undefined &&
drift.composite - priorComposite >= DELTA`*. When the field is omitted the gate is
byte-for-byte the current behaviour, so every existing call site compiles and runs
unchanged. `statusForScore` and `scoreDriftVector` are untouched — the delta is a
gate-level OR, not a new status.

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

### 6. Static screening — owner/management sanctions + country-of-origin & domicile risk

**Now:** the cascade only catches *changes* on the ownership and jurisdiction axes
(8-K control/leadership items in `secEdgar.ts`; relocation/owner keywords in
`stage0.ts`). It never **screens** the named people: owners and directors are not
matched against any sanctions/PEP list — `"sanction"` is merely an adverse-media
keyword on the `reputation` axis (`stage0.ts:51`), not a watchlist hit.
`BeneficialOwnerSchema` is just `{ name, share?, role? }` — **no nationality**, so
there is no notion of where an owner is *from*. And while the baseline carries the
company `jurisdiction`, nothing scores whether that country — or an owner's home
country — is sanctioned or high-risk (no FATF/high-risk-country list exists in code
or `data/`).

**Add:** a deterministic, point-in-time **screen** (Stage 0, no LLM), run at
baseline build and re-run whenever the ownership axis drifts:

1. **Person-level country-of-origin** — extend `BeneficialOwnerSchema` with an
   optional `nationality` (ISO country code). A small, additive, optional field;
   existing baselines stay valid.
2. **Sanctions / PEP screening** — match every owner, director and the entity name
   against OpenSanctions/PEP lists via the `opensanctions` connector (already a
   `Source`; not yet built). A hit emits a high-confidence `Signal` on `ownership`
   (sanctioned owner/controller) or `reputation` (sanctioned/PEP individual).
3. **Country risk** — score the company `jurisdiction` *and* each owner
   `nationality` against a FATF / high-risk-country list, emitting a `jurisdiction`
   `Signal` when the domicile or an owner's home country is high-risk.

All three are deterministic with regulator-grade confidence and reuse the existing
classify → normalize → validate path, so Stage 1/2/3 consume the output unchanged.

This is distinct from the news-driven enrichers in proposal 4 (which catch
*events* — a regulator acting, a country's FATF status changing) and from the
graph walk in proposal 3 (which reaches a sanctioned UBO *through relationships*).
Proposal 6 is the **static screen of named people and their countries** at a point
in time; it composes with both — a screening hit is also a strong propagation
trigger (proposal 5).

### Ingestion-layer proposals

The next seven widen and cheapen the connector layer to close the ingestion gaps in
`pipeline.md`. Proposals 12 and 13 enumerate the concrete sanctions, registry,
regulator, market and internal *sources* — OpenSanctions, GLEIF, ZEFIX, Companies
House, the non-US regulators, and the bank's own MCP history — as the ingestion side
of proposals 1, 4 and 6.

### 7. RSS news connector (breadth, free, multilingual)

**Now:** structural coverage is US-public-only; EventRegistry barely reaches
non-English entities.

**Add:** a `connectors/rss.ts` emitting the same `Signal[]` from ~40 curated global
feeds (FINMA, CNBC, Guardian, SCMP, DW…) at zero API cost, reaching the **non-US /
non-English** entities ER and EDGAR miss. Each entry routes through the **existing**
`classifyAxis` and `SignalSchema` — no new normalization path. Because RSS gives only
title + summary, pair it with **full-text scraping** (`@mozilla/readability` +
`jsdom`) before classification, and unwrap Google News `batchexecute` redirect links
so obfuscated URLs resolve to a real `sourceUrl` (citation target).

### 8. Cheap local NER as a Stage-0 entity filter

**Now:** RSS entries have no `conceptUri`, so entity resolution must happen on free
text.

**Add:** a local NER pass (GLiNER `company` label) to tag company mentions, then
match against the book by
normalized form ("Apple" = "Apple Inc."). The Stage-0 move: **zero token cost**,
runs locally, strengthens the cost-efficiency story.

The tradeoff is **infra, not tokens** — a ~1.5 GB lazy-loaded model carries real
disk and cold-start latency the rest of the cascade doesn't, and it only earns its
place once RSS (proposal 7) brings in free-text entries without a `conceptUri`. So
it is **deferred until proposal 7 lands**; before that, ER's entity resolution
already covers the book and the model is pure overhead.

### 9. Cross-source dedup + a fingerprint key

**Now:** `dedupeByEvent` is EventRegistry-specific; an 8-K and the article
reporting it never collapse.

**Add:** generalize dedup with a normalized text fingerprint (md5 of lowercased,
punctuation-stripped first ~1k chars) as a fallback cluster key alongside
`eventUri` / `sourceUrl`, and cluster **across** sources — keeping the
highest-confidence representative per event.

### 10. Stateful, incremental ingestion

**Now:** every run is a full re-pull, regardless of what changed.

**Add:** persist a per-entity watermark (last fetched date) and a `seen` set of
signal IDs, then fetch only `since:` the watermark. Ingestion cost then scales with
the *rate of new signals*, the same change-triggered principle the cascade already
uses downstream (proposal 2).

### 11. Ingestion hardening

**Now:** `fetchArticlesWindowed` is sequential and `classifyAxis` is English-only
regex.

**Add:** a bounded concurrency pool with backoff (SEC mandates ≤10 req/s and a
contact `User-Agent`; retry on 429/503), and multilingual classification once RSS
lands — gate by detected language or lean on the NER/embedding stage for non-English
routing.

### 12. Regulatory, sanctions, registry & market source connectors

**Now:** ingestion is two connectors — EventRegistry (news) and SEC EDGAR (US
filings). The `reputation` axis sees sanctions only as an adverse-media keyword
(`stage0.ts:51`); the `jurisdiction` axis has no regulator or FATF feed; funding,
liquidity and valuation events arrive only when a news outlet happens to report
them; and `ownership` has no registry of record.

**Add:** a family of deterministic connectors (Stage 0, no LLM), each normalising
to the canonical `Signal[]` and mapped to the axis it feeds — the concrete
ingestion side of proposals 4 and 6:

1. **Multi-regulator filings & enforcement** — FCA (UK), FINMA (CH), DFSA & ADGM
   (UAE), plus FATF status and enforcement databases — the non-US analogue of
   `secEdgar.ts`, feeding `reputation` (enforcement actions, licensing) and
   `jurisdiction` (FATF / country status).
2. **Sanctions lists** — OFAC, UN, EU and UK HMT, aggregated through the
   `opensanctions` connector (one connector covers all four lists) — feeding the
   owner / director / entity screen on `ownership` and `reputation` (proposal 6).
3. **Corporate registries** — Companies House (UK), GLEIF (LEI + ownership), ZEFIX
   (CH) — feeding `ownership` (UBO and control structure) and supplying the
   `nationality` / domicile inputs proposal 6 screens against.
4. **Market intelligence** — funding rounds, liquidity events, valuation changes
   and exchange-performance indicators — feeding `scale` with structured events
   rather than second-hand news mentions.

Each reuses the existing classify → normalize → validate path, so Stage 1/2/3
consume the output unchanged. The only additive cost is a `SOURCE_QUALITY` prior
per connector (proposal 1) and a `source` enum value — `opensanctions` and `gleif`
already exist in `SourceSchema`; the regulator, registry and market sources are
new, additive enum entries.

### 13. Internal / MCP intelligence — the outcome-feedback loop

**Now:** the confidence engine's *historical-accuracy* term (proposal 1) is a
stubbed constant because there is no track record of past predictions to score
against, and the pattern library and audit log have no internal-decision input —
every signal is external.

**Add:** an MCP-server connector surfacing the bank's *own* history — past KYC
decisions, prior investigations, internal risk assessments, transaction-monitoring
outputs and customer-profile changes — as `Signal`s and as `Outcome` audit entries.
This is the one source that closes the confidence engine's fourth term: realized
outcomes versus past drift verdicts finally populate *historical accuracy*, and
confirmed investigations seed the `PatternArchetype` library Stage 3 already matches
against. Internal records carry `manual`, regulator-grade confidence and reuse the
canonical seam; transaction-monitoring anomalies route to the existing `reputation`
/ `ownership` axes — no new AML axis, the 5-axis model holds (per the refused
9-dimension reshape below).

### 14. Blockchain / crypto-asset intelligence

**Now:** the cascade treats crypto as out of scope — no on-chain source is wired,
and `datastructure.md`'s "crypto-native risk" sat parked as a standalone dimension
the 5-axis model had no room for.

**Add:** treat crypto as **an asset-exposure lens on ordinary clients, not a client
type** (AMINA's framing — "another asset type, not something scary"; AMINA manages
clients who *hold* assets in crypto, most of them not crypto-native firms). Crypto
exposure on any customer enriches the *existing* axes rather than forking a new one.
The book's `strategy` hero is exactly this case: an enterprise-software company whose
risk profile drifted because it moved its treasury into Bitcoin — caught on
`business_model` + `scale`, no crypto-specific axis required.

1. **Wallet & counterparty screening** — a `connectors/chain.ts` (or a screening
   provider) resolves an entity's disclosed wallets and scores mixer, darknet and
   high-risk / sanctioned-counterparty exposure — emitting `reputation` (illicit-flow
   proximity) and `ownership` (a sanctioned wallet *is* a sanctions hit, composing
   with proposal 6) `Signal`s.
2. **On-chain treasury & flow as scale / business-model evidence** — a material
   shift of treasury into digital assets, or a jump in on-chain volume, is ordinary
   `business_model` (what the company holds and does) and `scale` (volume, tempo)
   drift — the same axes a fiat funding round moves.
3. **Graph integration** — extend the proposal 3 vocabulary with **Wallet** nodes
   and a **TRANSACTS_WITH** edge, so on-chain exposure propagates (proposal 5): risk
   reaches an entity through a sanctioned wallet exactly as it does through a
   sanctioned UBO.

Because every output is a normal `Signal` on an existing axis, Stage 0/1/2/3 consume
it unchanged — crypto becomes one more evidence source in the funnel, with its own
`SOURCE_QUALITY` prior (proposal 1) and `source` enum value, not a bolt-on engine.

## Refused proposals

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
- **Social & strategic intelligence** (LinkedIn hiring trends, executive
  departures, expansion announcements, strategic pivots) — the one
  `datastructure.md` source family left out: beyond the hero-entity demo scope, with
  no source wired, and largely a low-confidence adverse-media proxy the news
  connectors already approximate. (Blockchain intelligence, once parked here, is now
  **accepted** as proposal 14 — at AMINA's steer crypto is treated as another asset
  class enriching the existing axes, not a standalone risk dimension.)
