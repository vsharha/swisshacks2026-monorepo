# Sentinel

Dynamic KYC-Drift Monitor for AMINA Bank's SwissHacks 2026 challenge.

![Sentinel demo GIF](docs/assets/sentinel-demo.gif)

[Live demo](https://sentinel.viktorsharha.com)

Sentinel watches a bank's customer book for KYC drift: the slow, structural
changes that invalidate the risk profile a customer was onboarded with. Instead
of running expensive LLM analysis over every public signal, it uses cheap
deterministic stages to absorb the stable book and escalates only when a
customer's baseline actually moves.

The flagship demo follows Allbirds as it becomes NewBird AI, then Smartbird: a
low-risk sustainable footwear company that pivots into AI/GPU infrastructure,
sells its original business, changes leadership, and triggers a pattern match
against documented "hot-sector pivot" precedents such as Long Blockchain.

## What it does

- Monitors a customer book against public and internal risk signals.
- Converts every source into a shared Zod-validated `Signal` contract.
- Scores drift across five KYC axes: business model, ownership/control,
  jurisdiction, scale/activity, and reputation.
- Escalates through a cost-aware cascade: rules -> deterministic drift scoring
  -> per-axis LLM reasoning -> deep synthesis only when thresholds are crossed.
- Produces explainable RE-KYC alerts with citations, recommended actions,
  pattern-library priors, token/cost accounting, and a human-in-the-loop audit
  trail.

## Why this matters

KYC is usually treated as a point-in-time snapshot. That misses the cases where
a customer's risk does not explode in one obvious event, but drifts until the
original profile is no longer true.

For banks, especially crypto-facing banks, that is the hard version of ongoing
due diligence: business models, ownership structures, jurisdictions, financing,
token exposure, and adverse media can all shift faster than periodic re-screening
can keep up.

Sentinel is built around that specific failure mode. It asks: "Has this
customer structurally become a different risk than the one we onboarded?"

## Architecture

The repo is a pnpm monorepo with three main workspaces:

```text
apps/web/          SvelteKit dashboard deployed as the Sentinel demo
packages/core/     Framework-agnostic drift engine, schemas, connectors, pipeline
packages/scripts/  Offline extraction, graph, scoring, and fixture-capture scripts
data/              Versioned baselines, signals, pattern library, and analyses
docs/              Product, architecture, challenge, and design-system notes
```

The core pipeline is deliberately framework-free, so the same connector and
scoring code can be used by offline scripts and by the web app.

### Pipeline

1. **Ingest** source records from EventRegistry, SEC EDGAR, RSS, market/on-chain
   fixtures, internal samples, sanctions/PEP samples, and relationship data.
2. **Normalize** each record into the canonical `Signal` schema with source URL,
   date, axis, type, payload, and confidence.
3. **Route** signals to the five drift axes with cheap deterministic rules.
4. **Score** each axis and composite drift status using deterministic recency,
   clustering, confidence, and source-quality logic.
5. **Escalate** only moved axes to LLM materiality reasoning.
6. **Synthesize** a final alert only when the composite crosses the alert
   threshold.
7. **Record** every evaluation, escalation decision, alert, and human action in
   an append-only audit log.

The deployed public app replays captured Stage 2/3 analyses from `data/analysis`
so it is fast, deterministic, cheap to host, and safe to publish. The live LLM
and source connectors remain available through `packages/scripts` for offline
fixture generation and experimentation.

## Demo scenarios

- **Smartbird / Allbirds**: real SEC and news-backed drift from footwear into AI
  compute, with business-model, scale, reputation, and identity drift.
- **Strategy / MicroStrategy**: crypto-treasury drift from enterprise analytics
  into Bitcoin exposure and capital-market reflexivity.
- **Gulf Bridge Capital**: ownership and jurisdiction exposure through sanctions,
  graph links, and internal/reference signals.
- **NordTrade, Baltic Pay, Alpine Components, Helvetia Trading**: contrast cases
  that show hidden-controller propagation, partial escalation, and stable-book
  filtering.

## Cost model

The cost story is structural:

```text
All public signals
  -> Stage 0: entity match, dedupe, deterministic routing
  -> Stage 1: cheap drift scoring
  -> Stage 2: LLM reasoning only for drifting axes
  -> Stage 3: deep synthesis only for threshold-crossing customers
```

Stable customers should cost approximately nothing after ingestion. Expensive
reasoning scales with genuine drift, not with total book size or total news
volume.

By default, offline LLM runs target Apertus, Switzerland's open sovereign model,
through Public AI's OpenAI-compatible endpoint:

- Stage 2: `swiss-ai/apertus-8b-instruct`
- Stage 3: `swiss-ai/apertus-70b-instruct`

The model endpoint and model IDs are configurable.

## Run locally

Requirements:

- Node.js compatible with the pinned toolchain
- pnpm `10.28.2`

Install dependencies:

```sh
pnpm install
```

Start the web app:

```sh
pnpm dev
```

Then open the Vite URL, usually `http://localhost:5173`.

No API keys are required to run the dashboard because the public demo reads the
versioned data and captured analyses committed under `data/`.

## Environment variables

Create a repo-root `.env` only when running extraction or fresh LLM analysis:

```sh
EVENTREGISTRY_API_KEY=...
LLM_API_KEY=...

# Optional LLM overrides
LLM_BASE_URL=https://api.publicai.co/v1
LLM_STAGE2_MODEL=swiss-ai/apertus-8b-instruct
LLM_STAGE3_MODEL=swiss-ai/apertus-70b-instruct

# Optional extraction overrides
SEC_USER_AGENT="sentinel/0.1 contact@example.com"
SEC_CIK=1653909
ER_CONCEPT_URI=http://en.wikipedia.org/wiki/Allbirds
```

Additional scaffolded connectors accept keys such as `OPENSANCTIONS_API_KEY`,
`MARKET_API_KEY`, `CHAIN_API_KEY`, and `LINKEDIN_API_KEY`; without keys they
fall back to the bundled demo fixtures rather than pretending to perform a live
fetch.

## Useful commands

```sh
pnpm check
pnpm test
pnpm lint
pnpm fix
pnpm build
```

Extraction and analysis scripts:

```sh
pnpm --filter @kyc/scripts extract:sec
pnpm --filter @kyc/scripts extract:er
pnpm --filter @kyc/scripts score:drift
pnpm --filter @kyc/scripts analyze
pnpm --filter @kyc/scripts capture
```

Deploy the web app to Cloudflare Workers Static Assets:

```sh
pnpm deploy:cf
```

## Key implementation files

- `packages/core/src/schemas/` - Zod contracts for signals, baselines, drift,
  alerts, audit entries, patterns, and relationship graphs.
- `packages/core/src/connectors/` - framework-agnostic source connectors.
- `packages/core/src/drift/score.ts` - deterministic five-axis drift scoring.
- `packages/core/src/pipeline/` - Stage 0 routing, Stage 2/3 reasoning,
  escalation, graph enrichment, propagation, and pattern matching.
- `packages/core/src/llm/config.ts` - OpenAI-compatible LLM configuration and
  default Apertus models.
- `apps/web/src/lib/server/analyze.ts` - deterministic replay of captured
  analyses into the audit trail for the deployed demo.
- `apps/web/src/lib/components/app/` - Risk Control Room dashboard, drift radar,
  cost funnel, event feed, graph, pattern rail, and audit drawer.
- `data/` - demo customer baselines, signals, analyses, alerts, and pattern
  library.

## Documentation

- `docs/reference/product.md` - product thesis, scenario, and judging alignment.
- `docs/reference/techstack.md` - architecture, source map, and cost model.
- `docs/reference/pipeline.md` - as-built pipeline notes.
- `docs/reference/amina-design-system.md` - AMINA-inspired supervisory design
  language for the dashboard.
- `docs/brief/` - original SwissHacks challenge material.

## Status

This is a hackathon prototype, not a production compliance system. The repo is
public so the engineering can be inspected: schemas, fixtures, scoring logic,
tests, UI, and the captured analysis trail are all visible. Real deployment in a
banking environment would require production data governance, authentication,
model validation, source licensing review, monitoring, and legal/compliance sign
off.
