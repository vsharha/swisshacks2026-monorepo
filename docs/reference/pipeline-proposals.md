# Pipeline Proposals

Enhancements weighed against the current cascade in `pipeline.md`. Each is judged
on one rule: does it **layer onto the existing `Signal` seam and 5-axis drift
model**, or does it fork them? Accepted proposals are additive; refused ones
replace or conflict with the architecture, or fall outside the demo scope.

> Source material: the original generic-batch pipeline draft and the
> `datastructure.md` intelligence-layer vision. See `pipeline.md` for what is built.

## Accepted proposals

Enhancements that strengthen the existing cascade — proposals 1–6 on the scoring &
escalation path, 7–11 on the ingestion layer (the gaps noted in `pipeline.md`).
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

The next five widen and cheapen the connector layer to close the ingestion gaps in
`pipeline.md`. Proposals 7 and 8 are directly liftable from the sibling
`Amina-BANK` Python prototype. (The missing sanctions/registry/ownership *sources*
— OpenSanctions, GLEIF, ZEFIX, Companies House — are the ingestion side of
proposals 4 and 6 and aren't repeated here.)

### 7. RSS news connector (breadth, free, multilingual)

**Now:** structural coverage is US-public-only; EventRegistry barely reaches
non-English entities.

**Add:** a `connectors/rss.ts` emitting the same `Signal[]` from ~40 curated global
feeds (FINMA, CNBC, Guardian, SCMP, DW…) at zero API cost, reaching the **non-US /
non-English** entities ER and EDGAR miss (the `Amina-BANK` `rss_sources.txt` list
is ready to lift). Each entry routes through the **existing** `classifyAxis` and
`SignalSchema` — no new normalization path. Because RSS gives only title + summary,
pair it with **full-text scraping** (`@mozilla/readability` + `jsdom`, the TS
analogue of `trafilatura`) before classification, and port the Google News
`batchexecute` URL-unwrapper so redirect-obfuscated links resolve to a real
`sourceUrl` (citation target).

### 8. Cheap local NER as a Stage-0 entity filter

**Now:** RSS entries have no `conceptUri`, so entity resolution must happen on free
text.

**Add:** a local NER pass (GLiNER `company` label, as in `Amina-BANK`
`entity_extractor.py`) to tag company mentions, then match against the book by
normalized form ("Apple" = "Apple Inc."). The ideal Stage-0 move: **zero token
cost**, runs locally, strengthens the cost-efficiency story. Keep it lazy-loaded
(the model is ~1.5 GB).

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
- **Crypto-native / blockchain and social (LinkedIn) intelligence** — beyond the
  hero-entity demo scope, with no source wired for them.
