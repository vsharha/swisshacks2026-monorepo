# Ingestion

> How public signals enter the system, and where to take ingestion next.
> See `techstack.md` for the cost cascade and `product.md` for the drift model.

## The seam: one `Signal`, two callers

Every source normalizes to a single Zod-validated `Signal`:

```
{ id, entityId, axis, type, date, sourceUrl, title, source, payload, confidence }
```

This contract is the whole point of the ingestion layer. The same connector code
(`packages/core/src/connectors/`) powers two callers without drifting apart:

- **Offline extraction** (`@kyc/scripts`, `extract/*.ts`) → versioned JSON in `data/`, committed as the demo dataset.
- **Live SvelteKit routes** → the same functions, called with a runtime API key.

Connectors are framework-agnostic: they take `apiKey` / `userAgent` as arguments
and never read `process.env`, so neither caller can leak the other's config.

## Current sources

| Source | Connector | Covers | Limits |
|---|---|---|---|
| **EventRegistry** | `eventRegistry.ts` | Entity-resolved news, sentiment, event-cluster dedup | Key serves **~last 30 days** only; English-first; 100-article cap per call |
| **SEC EDGAR** | `secEdgar.ts` | Ground-truth structural filings (8-K rename/asset-sale/financing, delisting) | **US public companies only**; free + permanent |

EventRegistry is the recent adverse-media texture; SEC EDGAR is the permanent
structural spine. The split exists because the provided ER key can't reach
history (see `data/` and the note in `extract/eventregistry.ts`).

### How a signal is built

1. **Entity resolution** — ER `suggestConcept` resolves a name → `conceptUri`; SEC uses a CIK directly.
2. **Fetch** — `fetchArticlesWindowed` splits the range into day-windows (default 30, demo uses 7) to beat the 100-article-per-call cap and guarantee older events aren't truncated. SEC pulls the full submissions history in one call.
3. **Classify** — `stage0.classifyAxis` (news, keyword regex) or `classifyFiling` (8-K item-code → axis map) routes each item to a drift axis with a confidence. This is the ~free Stage-0 router.
4. **Normalize + validate** — `articlesToSignals` / `submissionsToSignals` build a `Signal` and `safeParse` it; failures are *dropped*, not thrown, so one bad URL never aborts a batch.
5. **Dedup** — `dedupeByEvent` collapses ER articles sharing an `eventUri` (the native ER cost lever: "one event, not 200 articles") and records `clusterSize`.

## Gap analysis vs. the challenge

The brief explicitly rewards source breadth, cheap stages, and the
sanctions/ownership signals that drive KYC drift. Against that, today:

- **Coverage is US-public-only at the structural layer.** A real KYC book is mostly private, EU, and Swiss entities. EDGAR sees none of them; ER barely reaches non-English.
- **No sanctions / registry / ownership sources.** The brief names OpenSanctions, GLEIF, ZEFIX, Companies House — these feed the `ownership` and `reputation` axes most directly, and we have zero of them.
- **Dedup is intra-EventRegistry only.** SEC + ER (and any future source) describing the same event don't collapse.
- **Ingestion is stateless** — every run is a full re-pull. The cost story ("expense scales with the *rate* of drift") wants incremental, watermark-based fetches.

## Suggested improvements

Ordered by leverage. The first three close the breadth/cost gap cheaply; (1) and
(2) are directly liftable from the sibling `Amina-BANK` Python prototype.

### 1. Add an RSS news connector (breadth, free, multilingual)

A `connectors/rss.ts` emitting the same `Signal[]` would add ~40 curated global
feeds (FINMA, CNBC, Guardian, NPR, SCMP, DW, Straits Times…) at zero API cost and
reach the **non-US / non-English** entities ER and EDGAR miss. The
`Amina-BANK/pipeline/news-feed/config/rss_sources.txt` list is ready to lift.

- Feed parse + concurrent fetch (bounded pool), then route each entry through the **existing** `classifyAxis` and `SignalSchema` — no new normalization path.
- RSS gives only title + summary, so classification quality is thin. Pair with **full-text scraping** (Mozilla Readability / `@mozilla/readability` + `jsdom`, the TS analogue of `trafilatura`) to recover article bodies before `classifyAxis`.
- If Google News feeds are used, port their `_decode_google_news_article_id` URL-unwrapper — Google News links are redirect-obfuscated and need the `batchexecute` decode to get a real `sourceUrl` (citation target).

### 2. Cheap local NER as a Stage-0 entity filter

RSS has no `conceptUri`, so entity resolution has to happen on free text. Run a
local NER pass (GLiNER `company` label, as in `Amina-BANK/entity_extractor.py`)
to tag company mentions, then match against the book by normalized form
("Apple" = "Apple Inc."). This is the *ideal* Stage-0 move: **zero token cost**,
runs locally, and strengthens the cost-efficiency story the rubric weighs at 20%.
Keep it optional/lazy-loaded — the model is ~1.5 GB.

### 3. Cross-source dedup + a fingerprint key

Generalize `dedupeByEvent` so it isn't ER-specific:

- Add a normalized text fingerprint (md5 of lowercased, punctuation-stripped first ~1k chars — their `text_fingerprint`) as a fallback cluster key alongside `eventUri` / `sourceUrl`.
- Cluster *across* sources so an 8-K and the news article reporting it collapse into one event with the highest-confidence representative kept.

### 4. Sanctions / registry / ownership connectors (highest-signal, roadmap)

To actually serve KYC drift, add at least one of:

- **OpenSanctions** — sanctions/PEP screening → `reputation` / `ownership`, the strongest single KYC signal.
- **GLEIF LEI** or **ZEFIX** (Swiss) / **Companies House** (UK) — legal name, domicile, and ownership changes → `business_model` / `jurisdiction` / `ownership` with deterministic, regulator-grade confidence (like our 8-K item map).

These are mostly free and map cleanly onto existing axes, so they reuse the whole
classify → normalize → validate path.

### 5. Stateful, incremental ingestion

Persist a per-entity watermark (last fetched date) and a `seen` set of signal IDs,
then fetch only `since:` the watermark. This makes ingestion cost scale with the
*rate of new signals* rather than re-pulling the full window each run — the same
"change-triggered" principle the cascade already uses downstream.

### 6. Hardening

- **Concurrency + backoff**: `fetchArticlesWindowed` is sequential; parallelize with a bounded pool. SEC mandates ≤10 req/s and a contact `User-Agent` — add a limiter + retry-on-429/503.
- **Multilingual classification**: `classifyAxis` is English-only regex. Once RSS lands, either gate by detected language or lean on the NER/embedding stage for non-English routing.
