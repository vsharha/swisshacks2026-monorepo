# Tech Stack & Architecture

> See `product.md` for the product concept and `frontend.md` for the design system.

## Stack

| Concern | Choice | Why |
|---|---|---|
| App | **SvelteKit** (full-stack) | One codebase for UI + server routes; fast to build; server routes host the live pipeline |
| News intelligence | **EventRegistry** (provided) | Entity-resolved retrieval, event-clustered dedup, concept/sentiment/co-mention metadata |
| LLM orchestration | **Vercel AI SDK** | Tiered model routing, structured outputs, streaming |
| Schemas / guardrails | **Zod** | Structured-output contracts + validation = a real hallucination check |
| Audit store | **SQLite** (`better-sqlite3` local) or **libSQL/Turso** (if deployed to Vercel) | One tiny append-only table; no heavy DB |
| Hosting | **Vercel** | Matches SvelteKit + AI SDK |

No traditional relational database. Most state is read-only seed/reference data committed to the repo; the only runtime write workload is the audit log, which gets one tiny table.

## Cost architecture (the differentiator)

The product is cheap to operate because **expense scales with risk/novelty, not with book size or signal volume**. Two structural properties, both generalizable to any book of any size:

**1. Tiered cascade — each tier kills ≥90% of volume at ≥10× lower unit cost.**

| Stage | Work | Cost | Role |
|---|---|---|---|
| 0 | Entity resolution + deterministic rules | ~free | Filter firehose to signals about a customer; EventRegistry event-clustering dedups at source |
| 1 | Embeddings + small classifier | cheap | Is this drift-relevant, and on which axis? Cosine distance to baseline + small model |
| 2 | LLM reasoning **per drifting axis** | mid | Reason about materiality — only on the axis that moved, for the entity that moved |
| 3 | Deep synthesis + recommended action + pattern-match | expensive | Only on entities that crossed the composite threshold |

**2. Change-triggered evaluation — stable customers cost ~nothing.** A cheap persistent state per customer (drift vector + baseline embeddings, computed once). On any given day ~99% of the book hasn't moved, so it never leaves Stage 0/1. Expensive reasoning fires only on the delta.

### Illustrative economics

Book ~5,000 customers, ~50,000 daily public signals:

| Stage | Volume/day | Unit cost | Stage cost |
|---|---|---|---|
| Naive baseline (big LLM on everything) | 50,000 | ~$0.02 | **~$1,000/day** |
| Stage 0 rules/entity-match | 50,000 → 2,000 | ~$0 | ~$0 |
| Stage 1 embeddings + small model | 2,000 → 200 | ~$0.0001 | $0.20 |
| Stage 2 per-axis LLM | 200 → 30 | ~$0.002 | $0.40 |
| Stage 3 deep synthesis | ~5 | ~$0.03 | $0.15 |
| **Our pipeline total** | | | **~$0.75/day** |

**~99% reduction**, structural — it comes from what the product does, not a demo trick. The claim judges can verify: cost scales with the *rate of genuine drift* in the book, not the number of customers or the volume of news.

The demo **instruments** this live: real funnel (signals in → survivors per tier → tokens + $ per stage → cost-per-1,000-alerts) against the naive baseline. A committed result cache exists only as an offline-Wi-Fi fallback, clearly labelled, never the headline.

## Data extraction — one connector layer, two callers

The same extraction code powers both the curated demo dataset and the live pipeline run (DRY; seed data and live mode can't drift apart).

**Canonical seam — a Zod `Signal` schema** every source normalizes to:
`{ entityId, axis, type, date, sourceUrl, title, payload, confidence }`. It's the contract shared by scripts and the app, and where source-citation enforcement lives.

**Mode 1 — offline extraction scripts** (`tsx`, write versioned JSON into `data/`, committed):
- `scripts/extract/eventregistry.ts` — entity `conceptUri` + date range → clustered events, normalized signals, concept-distribution snapshots per window
- `scripts/extract/sec-edgar.ts` — Allbirds CIK 1653909 → 8-K filings (rename, asset sale, $50M financing): ground-truth structural events
- `scripts/extract/wayback.ts` — allbirds.com → smartbird snapshots → website/business-activity change
- `scripts/extract/opensanctions.ts` — entity + co-mentioned people screening
- `scripts/build-baseline.ts` — assemble baseline KYC profiles
- `scripts/build-timeline.ts` — merge all sources into the unified, dated, cited scripted-clock timeline → `data/timeline/<entity>.json`
- `scripts/precompute-fallback.ts` — run the pipeline over the timeline to produce the demo fallback cache

**Mode 2 — live runtime:** SvelteKit server routes import the *same* connector functions to run EventRegistry live during the demo. Same fetch → normalize → validate path.

## Source map

| Source | Provides | Axes |
|---|---|---|
| **EventRegistry** | Entity-resolved news, event-clustered dedup, concept distribution, sentiment, co-mentions | Business model, reputation, ownership, scale |
| **SEC EDGAR (8-K)** | Ground-truth filings: rename, asset sale, financing | Identity/ownership, scale |
| **Wayback Machine** | Website/domain content change | Business model |
| **OpenSanctions** | Sanctions / PEP screening | Reputation, ownership |
| **GLEIF / OpenCorporates** | Legal entity / LEI changes | Identity, jurisdiction |

EventRegistry is the workhorse: its native event-clustering is a cost lever (one event, not 200 articles), and its concept/sentiment/co-mention metadata powers cheap first-pass drift scoring on 4 of 5 axes before any LLM call. It supplies the article URLs the LLM tier reasons over and cites.

## Repo layout

Single SvelteKit app — no pnpm workspaces (separation via `src/lib` + `scripts/`, zero workspace tooling overhead).

```
src/lib/
  schemas/        # Zod: Signal, KYCBaseline, DriftVector, Alert, AuditEntry
  connectors/     # eventRegistry.ts, secEdgar.ts, wayback.ts, openSanctions.ts
  pipeline/       # stage0-filter, stage1-embeddings, stage2-axis-llm, stage3-synthesis
  drift/          # per-axis scorers + composite
  audit/          # append-only log (SQLite/libSQL)
scripts/
  extract/        # offline extractors (Mode 1)
  build-timeline.ts, build-baseline.ts, precompute-fallback.ts
data/             # committed: baselines, timelines, pattern-library, fallback cache
src/routes/       # dashboard + API endpoints (Mode 2 live pipeline)
```

## State by type

| State | Where | DB? |
|---|---|---|
| Baseline KYC profiles | `data/` JSON | ✗ |
| Scripted timeline / clock events | `data/` JSON | ✗ |
| Pattern library (Long Blockchain archetype) | `data/` JSON | ✗ |
| LLM analysis results | precomputed fallback cache (`data/`) | ✗ |
| **Audit log + HITL decisions** | **SQLite/libSQL — one append-only table** | ✓ |

Public (Layer 1) and internal (Layer 2) data separation is enforced architecturally via separate modules/stores.
