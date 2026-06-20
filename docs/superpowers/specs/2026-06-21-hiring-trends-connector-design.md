# LinkedIn / Hiring-Trends Connector — Design

Adds a hiring-signal source to Layer 1 (public intelligence): rapid hiring,
hiring freezes, headcount drops, and hiring *pivots* (a shift toward a new
domain) as structured drift evidence. Closes the "no LinkedIn / hiring-trend
signal anywhere in the codebase" gap.

## Goal

The customer book has connectors for news, filings, sanctions, market events,
on-chain, registry, and internal records — but nothing on **hiring**. Hiring is
an early, public tell: a surge or geographic expansion is a scale change; a
freeze or layoffs is contraction / dormancy risk; and a hiring focus shift (e.g.
a beverage brand suddenly hiring crypto-custody and AML engineers) signals a
business-model pivot *before* it shows up in news or filings.

We add a `linkedin` connector that mirrors the existing `market` connector
exactly: a Zod input schema, a pure `*ToSignals` transform, a `fetch*` live
scaffold, a reference fixture, an extract script, and seed data. No real scraping
(LinkedIn has no usable free API and ToS constraints) — the live fetch is a
documented key seam, the demo runs off the bundled fixture.

## Non-goals

- No real LinkedIn scraping / API integration (scaffold only, like every other
  connector's live fetch).
- No new UI surfaces beyond a `deriveMarketResearch` branch — signals flow
  through the existing pipeline and Events table automatically.
- No senior-hire (ownership) or geographic-expansion (jurisdiction) modelling in
  this slice (the "broad multi-axis" option was rejected as over-scope).

## 1. New source — `packages/core/src/schemas/common.ts` + `drift/confidence.ts`

Add `"linkedin"` to `SourceSchema` (`common.ts`). Add a `SOURCE_QUALITY` prior in
`confidence.ts`:

```ts
  linkedin: 0.7, // structured hiring-trend data (inferred from public postings)
```

`SOURCE_QUALITY` is a `Record<Source, number>`, so adding `linkedin` to the
`Source` enum makes the missing prior a compile error until added — type-enforced
completeness.

## 2. Connector — `packages/core/src/connectors/linkedin.ts`

Mirrors `market.ts`:

```ts
import { z } from "zod";
import { EventDate } from "../schemas/common.ts";
import { SignalSchema, type Signal } from "../schemas/index.ts";

/** A structured hiring-trend event (LinkedIn / job-board derived). */
export const HiringEventSchema = z.object({
  entityId: z.string().min(1),
  kind: z.enum(["hiring_surge", "hiring_freeze", "headcount_drop", "hiring_pivot"]),
  /** Current headcount, when known. */
  headcount: z.number().optional(),
  /** Headcount or open-roles change, percent. */
  changePct: z.number().optional(),
  /** Current open-role count, when known. */
  openRoles: z.number().optional(),
  /** For a pivot: the new hiring focus (e.g. "digital asset custody & AML"). */
  focus: z.string().optional(),
  date: EventDate,
  sourceUrl: z.url(),
  title: z.string().min(1),
});
export type HiringEvent = z.infer<typeof HiringEventSchema>;

/** Per-kind confidence: a pivot is inferred (softer) than a headcount move. */
const HIRING_CONFIDENCE: Record<HiringEvent["kind"], number> = {
  hiring_surge: 0.72,
  hiring_freeze: 0.72,
  headcount_drop: 0.72,
  hiring_pivot: 0.6,
};

/** Map a structured hiring event to a drift Signal. */
export function hiringEventToSignals(event: HiringEvent): Signal[] {
  return [
    SignalSchema.parse({
      id: `linkedin-${event.entityId}-${event.kind}-${event.date}`,
      entityId: event.entityId,
      // A pivot is a business-model tell; surges/freezes/drops are scale/activity.
      axis: event.kind === "hiring_pivot" ? "business_model" : "scale",
      type: event.kind,
      date: event.date,
      sourceUrl: event.sourceUrl,
      title: event.title,
      source: "linkedin",
      payload: {
        headcount: event.headcount ?? null,
        changePct: event.changePct ?? null,
        openRoles: event.openRoles ?? null,
        focus: event.focus ?? null,
      },
      confidence: HIRING_CONFIDENCE[event.kind],
    } satisfies Record<string, unknown>),
  ];
}

export interface FetchHiringEventsParams {
  apiKey?: string;
  entityId?: string;
}

/** Live hiring-data fetch — scaffold; returns [] without a key (demo uses fixture). */
export async function fetchHiringEvents(params: FetchHiringEventsParams): Promise<HiringEvent[]> {
  if (!params.apiKey) {
    console.warn("[linkedin] no apiKey — set LINKEDIN_API_KEY for live hiring data; returning []");
    return [];
  }
  console.warn("[linkedin] live hiring feed not implemented yet; returning []");
  return [];
}
```

Export from `packages/core/src/connectors/index.ts`.

## 3. Extract script + fixture

`data/reference/hiring-sample.json` (input fixture) and
`packages/scripts/src/extract/linkedin.ts` (mirrors `extract/market.ts`): parse
the fixture with `HiringEventSchema.array()`, map via `hiringEventToSignals`,
group by entity, and `writeData("signals/<entityId>.linkedin.json", signals)`.
Run: `pnpm --filter @kyc/scripts exec tsx src/extract/linkedin.ts`.

Seed fixture entries:

- **strategy** — `hiring_pivot`, focus "Bitcoin treasury & on-chain custody"
  (business_model; reinforces the MicroStrategy crypto pivot); plus a
  `hiring_surge` (scale).
- **smartbird** — `headcount_drop` (scale contraction; aligns with its −38%
  valuation signal) and/or a `hiring_freeze`.

The produced `data/signals/<entity>.linkedin.json` files are loaded automatically
by `loadBook` (which merges every `<entity>.*.json`).

## 4. UI — `apps/web/src/lib/view.ts`

Add a `case 'linkedin':` branch to `deriveMarketResearch` so the **Market
research** column reads naturally, e.g.:
- pivot → `Hiring pivot → digital asset custody & AML`
- surge → `Hiring surge · +45% · 60 open roles`
- drop → `Headcount −20%`

Built from `payload.focus` / `changePct` / `openRoles` / `headcount`. No other UI
changes — drift scoring, the Events table, and the signal-inference column all
consume the new signals through the existing pipeline.

## 5. Testing (TDD)

- `packages/core/src/connectors/linkedin.test.ts`:
  - `HiringEventSchema` parses a full event and a minimal one (only required
    fields); rejects an unknown `kind`.
  - `hiringEventToSignals`: `hiring_pivot` → `business_model` axis;
    `hiring_surge` / `hiring_freeze` / `headcount_drop` → `scale` axis; payload
    carries focus/changePct/openRoles/headcount; confidence matches the per-kind
    map; the result passes `SignalSchema` (already enforced by `.parse`, asserted
    via id/source/axis).
- `SOURCE_QUALITY` completeness is type-enforced (no separate test).
- The `deriveMarketResearch` branch is verified by `pnpm check` + a browser pass
  (apps/web has no test runner).

## Why this fits

Hiring is a public Layer-1 signal that maps cleanly onto the existing drift axes
(scale + business_model), reuses the well-worn `market` connector pattern with
zero new infrastructure, and strengthens two challenge use-cases — "Scale Risk
Change" and the SaaS→crypto "Material Business Model Change" — with evidence that
often precedes the news.
