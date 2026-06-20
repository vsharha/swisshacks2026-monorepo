# LinkedIn / Hiring-Trends Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `linkedin` connector that turns structured hiring events (surge / freeze / headcount drop / pivot) into drift Signals, mirroring the existing `market` connector.

**Architecture:** New `linkedin` source enum value + `SOURCE_QUALITY` prior; a pure `hiringEventToSignals` transform routing pivots to the `business_model` axis and the rest to `scale`; a reference fixture + extract script that writes per-entity signal files the app already loads; and a `deriveMarketResearch` UI branch. No new infrastructure, no real scraping.

**Tech Stack:** TypeScript, Zod v4, Vitest, SvelteKit (Svelte 5).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-21-hiring-trends-connector-design.md`. No real LinkedIn scraping — live fetch is a `[]`-returning scaffold like `fetchMarketEvents`.
- Axis routing: `hiring_pivot` → `business_model`; `hiring_surge` / `hiring_freeze` / `headcount_drop` → `scale`.
- Per-kind confidence: surge/freeze/drop = `0.72`, pivot = `0.6`. `SOURCE_QUALITY.linkedin = 0.7`.
- `packages/core` imports use the `.ts` extension (e.g. `from "./common.ts"`).
- Mirror the `market` connector exactly (`connectors/market.ts`, `scripts/src/extract/market.ts`, `data/reference/market-sample.json`).
- Before committing a task that touched code: `pnpm check`, then `pnpm fix`, then `pnpm lint`.
- Commit as the user: `--author="olivierluethy <olivier.luethy@gmx.net>"`, short title, no description block.
- Core tests: `pnpm --filter @kyc/core test -- <file>`.

---

## File Structure

- `packages/core/src/schemas/common.ts` — add `"linkedin"` to `SourceSchema`. (Task 1)
- `packages/core/src/drift/confidence.ts` — add `linkedin` to `SOURCE_QUALITY`. (Task 1)
- `packages/core/src/connectors/linkedin.ts` — **new** connector. (Task 1)
- `packages/core/src/connectors/index.ts` — export the connector. (Task 1)
- `packages/core/src/connectors/linkedin.test.ts` — **new** tests. (Task 1)
- `data/reference/hiring-sample.json` — **new** input fixture. (Task 2)
- `packages/scripts/src/extract/linkedin.ts` — **new** extract script. (Task 2)
- `data/signals/<entity>.linkedin.json` — **generated** by the script. (Task 2)
- `apps/web/src/lib/view.ts` — `deriveMarketResearch` `linkedin` branch. (Task 3)

---

## Task 1: Source + connector + tests

**Files:**
- Modify: `packages/core/src/schemas/common.ts`
- Modify: `packages/core/src/drift/confidence.ts`
- Create: `packages/core/src/connectors/linkedin.ts`
- Modify: `packages/core/src/connectors/index.ts`
- Create: `packages/core/src/connectors/linkedin.test.ts`

**Interfaces:**
- Produces: `"linkedin"` in `Source`; `HiringEventSchema`/`type HiringEvent`; `hiringEventToSignals(event: HiringEvent): Signal[]`; `fetchHiringEvents(params): Promise<HiringEvent[]>`. All re-exported via `@kyc/core/connectors` (and `@kyc/core` for the schema types).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/connectors/linkedin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HiringEventSchema, hiringEventToSignals } from "./linkedin.ts";
import { SignalSchema } from "../schemas/index.ts";

const base = {
  entityId: "e1",
  date: "2026-05-01",
  sourceUrl: "https://www.linkedin.com/company/example/jobs/",
  title: "t",
};

describe("HiringEventSchema", () => {
  it("parses a full event", () => {
    const e = HiringEventSchema.parse({
      ...base,
      kind: "hiring_surge",
      headcount: 320,
      changePct: 45,
      openRoles: 60,
    });
    expect(e.kind).toBe("hiring_surge");
    expect(e.changePct).toBe(45);
  });
  it("parses a minimal event (only required fields)", () => {
    const e = HiringEventSchema.parse({ ...base, kind: "hiring_freeze" });
    expect(e.headcount).toBeUndefined();
  });
  it("rejects an unknown kind", () => {
    expect(() => HiringEventSchema.parse({ ...base, kind: "mass_hire" })).toThrow();
  });
});

describe("hiringEventToSignals", () => {
  it("routes a pivot to the business_model axis with its focus in payload", () => {
    const [s] = hiringEventToSignals(
      HiringEventSchema.parse({ ...base, kind: "hiring_pivot", focus: "digital asset custody & AML" }),
    );
    expect(s.axis).toBe("business_model");
    expect(s.type).toBe("hiring_pivot");
    expect(s.source).toBe("linkedin");
    expect(s.payload.focus).toBe("digital asset custody & AML");
    expect(s.confidence).toBe(0.6);
    expect(() => SignalSchema.parse(s)).not.toThrow();
  });
  it("routes surge / freeze / drop to the scale axis at 0.72", () => {
    for (const kind of ["hiring_surge", "hiring_freeze", "headcount_drop"] as const) {
      const [s] = hiringEventToSignals(HiringEventSchema.parse({ ...base, kind }));
      expect(s.axis).toBe("scale");
      expect(s.confidence).toBe(0.72);
    }
  });
  it("carries headcount / changePct / openRoles into payload (null when absent)", () => {
    const [s] = hiringEventToSignals(
      HiringEventSchema.parse({ ...base, kind: "hiring_surge", headcount: 320, changePct: 45, openRoles: 60 }),
    );
    expect(s.payload).toMatchObject({ headcount: 320, changePct: 45, openRoles: 60, focus: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @kyc/core test -- linkedin.test.ts`
Expected: FAIL — module `./linkedin.ts` does not exist.

- [ ] **Step 3: Add `linkedin` to the Source enum**

In `packages/core/src/schemas/common.ts`, in `SourceSchema`, add the entry after `"market",`. Change:

```ts
  "market",
  "chain",
```

to:

```ts
  "market",
  "linkedin",
  "chain",
```

- [ ] **Step 4: Add the `SOURCE_QUALITY` prior**

In `packages/core/src/drift/confidence.ts`, add a `linkedin` entry. Change:

```ts
  chain: 0.78, // on-chain / wallet-screening providers (proposal 14)
```

to:

```ts
  chain: 0.78, // on-chain / wallet-screening providers (proposal 14)
  linkedin: 0.7, // structured hiring-trend data (inferred from public postings)
```

- [ ] **Step 5: Create the connector**

Create `packages/core/src/connectors/linkedin.ts`:

```ts
import { z } from "zod";
import { EventDate } from "../schemas/common.ts";
import { SignalSchema, type Signal } from "../schemas/index.ts";

/**
 * Hiring-trends connector: rapid hiring, freezes, headcount drops, and hiring
 * *pivots* (a focus shift toward a new domain) as structured drift evidence.
 * Mirrors the `market` connector — deterministic transform + sample fixture do
 * the demo work; the live `fetchHiringEvents` is a documented key seam (LinkedIn
 * has no usable free API). A surge/freeze/drop is `scale` (activity tempo); a
 * pivot is a `business_model` tell, often before it surfaces in the news.
 */

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

/**
 * Live hiring-data fetch — scaffold. With no API key, returns [] and logs the key
 * seam rather than throwing, so the demo runs off the bundled fixture.
 */
export async function fetchHiringEvents(params: FetchHiringEventsParams): Promise<HiringEvent[]> {
  if (!params.apiKey) {
    console.warn("[linkedin] no apiKey — set LINKEDIN_API_KEY for live hiring data; returning []");
    return [];
  }
  console.warn("[linkedin] live hiring feed not implemented yet; returning []");
  return [];
}
```

- [ ] **Step 6: Export the connector**

In `packages/core/src/connectors/index.ts`, add (keep the existing lines):

```ts
export * from "./linkedin.ts";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @kyc/core test -- linkedin.test.ts`
Expected: PASS (all cases).

- [ ] **Step 8: Typecheck, then commit**

Run: `pnpm check`
Expected: 0 errors (the `SOURCE_QUALITY` entry satisfies the `Record<Source, number>` completeness check).

```bash
git add packages/core/src/schemas/common.ts packages/core/src/drift/confidence.ts packages/core/src/connectors/linkedin.ts packages/core/src/connectors/index.ts packages/core/src/connectors/linkedin.test.ts
git commit -m "Add LinkedIn hiring-trends connector" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 2: Fixture + extract script + seed data

**Files:**
- Create: `data/reference/hiring-sample.json`
- Create: `packages/scripts/src/extract/linkedin.ts`
- Generated: `data/signals/strategy.linkedin.json`, `data/signals/smartbird.linkedin.json`

**Interfaces:**
- Consumes: `HiringEventSchema`, `hiringEventToSignals` from `@kyc/core/connectors`; `readData`, `writeData` from `../lib/repo.ts`; `type Signal` from `@kyc/core`.
- Produces: per-entity `data/signals/<entityId>.linkedin.json` files, loaded by `loadBook` (merges every `<entity>.*.json`).

- [ ] **Step 1: Create the input fixture**

Create `data/reference/hiring-sample.json`:

```json
[
  {
    "entityId": "strategy",
    "kind": "hiring_pivot",
    "focus": "Bitcoin treasury & on-chain custody",
    "openRoles": 18,
    "date": "2026-04-28",
    "sourceUrl": "https://www.linkedin.com/company/microstrategy/jobs/",
    "title": "Hiring shift toward digital-asset custody, on-chain ops and treasury engineering roles."
  },
  {
    "entityId": "strategy",
    "kind": "hiring_surge",
    "headcount": 410,
    "changePct": 22,
    "openRoles": 35,
    "date": "2026-05-12",
    "sourceUrl": "https://www.linkedin.com/company/microstrategy/jobs/",
    "title": "Headcount up ~22% year-on-year, concentrated in crypto and finance functions."
  },
  {
    "entityId": "smartbird",
    "kind": "headcount_drop",
    "headcount": 240,
    "changePct": -18,
    "date": "2026-03-25",
    "sourceUrl": "https://www.linkedin.com/company/allbirds/jobs/",
    "title": "Headcount down ~18% year-on-year amid restructuring."
  },
  {
    "entityId": "smartbird",
    "kind": "hiring_freeze",
    "openRoles": 2,
    "date": "2026-04-02",
    "sourceUrl": "https://www.linkedin.com/company/allbirds/jobs/",
    "title": "Open roles collapse to near-zero — effective hiring freeze."
  }
]
```

- [ ] **Step 2: Create the extract script**

Create `packages/scripts/src/extract/linkedin.ts` (mirrors `extract/market.ts`):

```ts
import { hiringEventToSignals, HiringEventSchema } from "@kyc/core/connectors";
import { type Signal } from "@kyc/core";
import { readData, writeData } from "../lib/repo.ts";

/**
 * Hiring-trends extract: run the deterministic transform over the bundled sample
 * fixture and write `scale` / `business_model` Signals to
 * data/signals/<entityId>.linkedin.json, where the live app loads them like any
 * source. The live hiring feed is a documented scaffold.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/extract/linkedin.ts
 */

const events = HiringEventSchema.array().parse(await readData("reference/hiring-sample.json"));

const byEntity = new Map<string, Signal[]>();
for (const event of events) {
  for (const s of hiringEventToSignals(event)) {
    if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
    byEntity.get(s.entityId)!.push(s);
  }
}

let total = 0;
for (const [entityId, signals] of [...byEntity.entries()].sort()) {
  signals.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const out = await writeData(`signals/${entityId}.linkedin.json`, signals);
  total += signals.length;
  console.log(`${entityId}: ${signals.length} hiring signal(s) → ${out}`);
}
console.log(`\n${total} hiring signal(s) across ${byEntity.size} entit(y/ies).`);
```

- [ ] **Step 3: Run the extract script to generate the signal files**

Run: `pnpm --filter @kyc/scripts exec tsx src/extract/linkedin.ts`
Expected output (paths may vary):
```
smartbird: 2 hiring signal(s) → .../data/signals/smartbird.linkedin.json
strategy: 2 hiring signal(s) → .../data/signals/strategy.linkedin.json

4 hiring signal(s) across 2 entit(y/ies).
```
(If a pnpm command fails on sandbox/cert grounds, retry the Bash call with `dangerouslyDisableSandbox: true`.)

- [ ] **Step 4: Verify the generated files parse as signals**

Run:
```bash
pnpm --filter @kyc/scripts exec tsx -e "import { SignalArraySchema } from '@kyc/core'; import { readFileSync } from 'node:fs'; for (const f of ['strategy','smartbird']) { const a = SignalArraySchema.parse(JSON.parse(readFileSync('data/signals/'+f+'.linkedin.json','utf8'))); console.log(f, a.length, a.map(s=>s.axis+':'+s.type).join(', ')); }"
```
Expected:
```
strategy 2 business_model:hiring_pivot, scale:hiring_surge
smartbird 2 scale:headcount_drop, scale:hiring_freeze
```

- [ ] **Step 5: Commit**

```bash
git add data/reference/hiring-sample.json packages/scripts/src/extract/linkedin.ts data/signals/strategy.linkedin.json data/signals/smartbird.linkedin.json
git commit -m "Seed hiring-trend signals for strategy and smartbird" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 3: UI — hiring context in the Market research column

**Files:**
- Modify: `apps/web/src/lib/view.ts`

**Interfaces:**
- Consumes: the `linkedin` signals' `payload` (`focus`, `changePct`, `headcount`, `openRoles`) and the existing private `num`/`str` helpers in `view.ts`.
- Produces: a `linkedin` branch in `deriveMarketResearch` so the Events table's Market research column reads naturally.

- [ ] **Step 1: Add the `linkedin` branch**

In `apps/web/src/lib/view.ts`, in `deriveMarketResearch`, add a `case 'linkedin':` immediately before the `default:` case. Change:

```ts
		default:
			return `${s.source.replace(/_/g, ' ')} record`;
	}
}
```

to:

```ts
		case 'linkedin': {
			const focus = str(p.focus);
			if (focus) return `Hiring pivot → ${focus}`;
			const parts: string[] = [];
			const changePct = num(p.changePct);
			const headcount = num(p.headcount);
			const openRoles = num(p.openRoles);
			if (changePct !== null) parts.push(`${changePct > 0 ? '+' : ''}${changePct}% headcount`);
			if (headcount !== null) parts.push(`${headcount} staff`);
			if (openRoles !== null) parts.push(`${openRoles} open roles`);
			return parts.length ? `Hiring · ${parts.join(' · ')}` : 'Hiring signal';
		}
		default:
			return `${s.source.replace(/_/g, ' ')} record`;
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Verify in the browser**

With the dev server running (`pnpm --filter @kyc/web dev`), open **MicroStrategy** (strategy):
- The Events table contains hiring rows: a `business_model` row "Hiring shift toward digital-asset custody…" with Market research `Hiring pivot → Bitcoin treasury & on-chain custody`, and a `scale` row with `Hiring · +22% headcount · 410 staff · 35 open roles`.
- Open **Allbirds** (smartbird): a `scale` `headcount_drop` row showing `Hiring · -18% headcount · 240 staff` and a `hiring_freeze` row showing `Hiring · 2 open roles`.
- Confirm these signals also nudge the scale / business-model axes in the drift breakdown (they feed `scoreDriftVector` automatically).

- [ ] **Step 4: Fix, lint, then commit**

Run: `pnpm fix` then `pnpm lint`
Expected: lint clean.

```bash
git add apps/web/src/lib/view.ts
git commit -m "Show hiring context in the events market-research column" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Self-Review notes

- **Spec coverage:** §1 source+prior → Task 1 (steps 3-4); §2 connector → Task 1; §3 fixture+extract+seed → Task 2; §4 UI branch → Task 3; §5 testing → Task 1 tests (+ type-enforced `SOURCE_QUALITY`, browser check for UI). All covered.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `HiringEventSchema`/`HiringEvent`/`hiringEventToSignals`/`fetchHiringEvents` defined in Task 1 and consumed verbatim in Task 2. Axis routing (pivot→business_model, else→scale) and confidence (0.72 / 0.6) are identical across the spec, Task 1 connector, Task 1 tests, and Task 2 verification. The `linkedin` source string is consistent across enum, connector, extract output filename, and the UI branch. `num`/`str` are existing `view.ts` helpers reused in Task 3.
