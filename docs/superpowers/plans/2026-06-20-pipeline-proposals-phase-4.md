# Pipeline Proposals — Phase 4 (Source Connectors & Intelligence) Plan

> Status: **done.** All 14 proposals are merged. This phase shipped: SEC
> enforcement (live), the GLEIF registry → ownership-edge connector, the market
> connector (`scale`), the blockchain connector (wallet screening + on-chain
> treasury + wallet graph nodes), the internal/MCP feedback loop (closing the
> confidence engine's historical-accuracy term), and the opt-in NER
> `resolveEntities` seam. Companies House / ZEFIX and a *live* GLEIF/market/chain/
> MCP fetch remain as documented seams (scaffolds return `[]`/`null` without creds).
> Kept below as the record of intent.

**Goal:** Complete proposals 8, 12, 13, 14 from `pipeline-proposals.md`. Per the
locked tier-D convention, the external/registry/internal/on-chain sources ship as
**typed `Signal`-emitting scaffolds over sample fixtures**, each with a documented
live-key seam and **no live credentials in the repo** — exactly like the
`opensanctions` connector (matcher + fixture do the real work; `fetchSanctions` is
a stub that logs and returns `[]`).

**Architecture (unchanged):** every new source normalizes to the canonical
`Signal` and maps to an existing axis, so Stage 0/1/2/3 consume it unchanged. New
work is additive: new `SourceSchema` enum values + their `SOURCE_QUALITY` priors
(proposal 1), pure deterministic transforms in `@kyc/core`, and offline extract
scripts in `@kyc/scripts` that load fixtures and write `data/signals/<entity>.*`.

## Foundations already in place (reuse, don't rebuild)

- `@kyc/core/util` — `mapPool`, `withRetry`/`isRetryableStatus` (concurrency +
  backoff), and `IngestState` watermark folds (`filterUnseen`, `advanceState`).
  Fs persistence in `@kyc/scripts/lib/state.ts`.
- `@kyc/core/connectors/rss.ts` — `matchEntities` (distinctiveness-guarded
  normalized-form matcher), `parseFeed`, `extractReadable`, `unwrapGoogleNewsUrl`.
- `@kyc/core/graph` — node/edge model + walk; proposal 14 extends its vocabulary.
- Confidence engine, screening (`screenEntity`), country-risk reference.

## Tasks

### Proposal 12 (remaining) — registry + market connectors

The regulator/enforcement half landed (SEC enforcement; FATF country-risk). Remaining:

- **Corporate registries** — `connectors/gleif.ts` (LEI + parent/child ownership),
  Companies House (UK), ZEFIX (CH). Feed `ownership` (UBO/control structure) and
  supply the `nationality`/domicile inputs `screenEntity` already screens. The
  ownership edges also feed `buildGraph` (the `extraEdges` seam already exists —
  `data/reference/ownership-links.json` is the manual stand-in). Add `gleif` (prior
  already 0.95) and a `companies_house` / `zefix` source if wired separately.
- **Market intelligence** — `connectors/market.ts`: funding rounds, liquidity
  events, valuation/exchange-performance → structured `scale` signals (not
  second-hand news). New `market` source + prior (~0.8).
- Each: pure `…ToSignals(records, …)` + a scaffolded `fetch…` (logs + `[]` with no
  key) + a sample fixture under `data/reference/` + an extract script. Tests on
  the pure transform.

### Proposal 13 — internal / MCP intelligence (the outcome-feedback loop)

- `connectors/internal.ts` (or an MCP-server connector) surfacing the bank's own
  history — past KYC decisions, investigations, transaction-monitoring anomalies —
  as `Signal`s (axes `reputation`/`ownership`; **no new AML axis**) and as
  `Outcome` audit entries. `manual`/regulator-grade confidence.
- **Closes the confidence engine's 4th term:** realized outcomes vs. past drift
  verdicts finally populate *historical accuracy* (today stubbed as source-quality
  in `confidence.ts`). Wire `confidenceForAxis` to take an optional historical
  signal once outcomes exist.
- Caveat (from the connector probe): interactively-authenticated MCP servers may
  be absent in headless/cron runs — scaffold + fixture, document the seam.

### Proposal 14 — blockchain / crypto-asset intelligence

- `connectors/chain.ts`: resolve disclosed wallets, score mixer/darknet/sanctioned
  counterparty exposure → `reputation` (illicit-flow proximity) and `ownership`
  (a sanctioned wallet *is* a sanctions hit, composing with `screenEntity`).
  Treasury/on-chain volume shifts → `business_model` + `scale` (the `strategy`
  hero's framing: crypto as an asset lens on ordinary clients, not a new axis).
- **Graph integration:** the `graph.ts` schema already has `wallet` node +
  `TRANSACTS_WITH` edge types reserved — populate them so on-chain exposure
  propagates (proposal 5) exactly as a sanctioned UBO does.
- New `chain` source + prior. Scaffold fetch + sample wallet/screening fixture.

### Proposal 8 — local NER as a Stage-0 entity filter

- The cheap normalized-form matcher (`matchEntities`) is the default and is
  merged. Proposal 8 is the **heavy GLiNER `company` model** as an opt-in upgrade
  for free-text without a `conceptUri`. Real cost is **infra, not tokens** (~1.5 GB
  lazy-loaded model, cold-start latency). Recommended shape: an optional async
  `nerMatch(text)` behind an env/flag that falls back to `matchEntities` when the
  model isn't present — so CI and the demo never require the download.

## Global constraints (unchanged from prior phases)

- Additive only; existing `data/` fixtures must still parse.
- Core stays framework-agnostic (no `process.env`, no `fs` in core); scripts own IO.
- Every `Signal` needs a real `sourceUrl`; risk and confidence stay separate.
- Tier-D scaffold convention: no live creds; a keyless fetch logs and returns `[]`.
- Commit as the user, short title only, no description/co-author trailer.
- Before each commit when code changed: `pnpm check`, `pnpm fix`, `pnpm lint`.
