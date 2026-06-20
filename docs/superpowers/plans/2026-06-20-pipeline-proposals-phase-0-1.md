# Pipeline Proposals — Phase 0 + 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the live drift-scoring and escalation path with a weighted confidence engine (proposal 1), change-triggered delta alerting (proposal 2), and cross-source signal dedup (proposal 9) — and stand up the test runner the repo currently lacks.

**Architecture:** All work lands in `@kyc/core` as pure, deterministic functions on the existing `Signal`/`DriftVector` schemas, plus a thin wiring change in the SvelteKit `analyzeEntity` server function. No schema changes, no new dependencies beyond Vitest. Pure logic is fully unit-tested; the one app-side wiring change is verified by typecheck + a manual smoke (the repo has no app-test harness).

**Tech Stack:** TypeScript (ESM, `.ts` import specifiers), Zod v4, Vitest, pnpm workspaces, Node 22+ (`node:crypto`).

## Global Constraints

- **Additive only — no schema changes in this plan.** The 5-axis model and canonical `Signal` shape are fixed. The spec's Phase-0 schema additions (`BeneficialOwner.nationality`, new `SourceSchema` values, `Alert.relationshipPath`) are **deferred to the phases that consume them** (Phase 2/3/4); nothing here needs them.
- **Connectors stay framework-agnostic:** take `apiKey`/`userAgent` as args, never read `process.env`.
- **`SOURCE_QUALITY` covers exactly the 7 current `Source` enum values.** New sources get their prior added in the phase that introduces their connector.
- **Risk and confidence stay separate** (proposal 1): a high-confidence signal can still be low-risk.
- **Commit style (per AGENTS.md):** commit as the user; short title only; **no description block and no co-author trailer**; match the existing log style. Commit all unstaged changes you intend, but do **not** sweep in the pre-existing modified `.claude/settings.json` — leave it for the user.
- **Before each commit, when code changed:** run `pnpm check`, then `pnpm fix`, then `pnpm lint` (per AGENTS.md).

---

### Task 1: Stand up Vitest + `SOURCE_QUALITY` priors

**Files:**
- Modify: `packages/core/package.json` (add Vitest dep + `test` scripts)
- Create: `packages/core/src/drift/confidence.ts`
- Create: `packages/core/src/drift/confidence.test.ts`
- Modify: `packages/core/src/drift/index.ts` (export the new module)
- Modify: `package.json` (root — add `test` script)

**Interfaces:**
- Produces: `SOURCE_QUALITY: Record<Source, number>`, `sourceQuality(source: Source): number`, `recencyWeight(signalDate: string, asOf: string): number`, `confidenceForAxis(signals: Signal[], asOf: string): number` — all from `@kyc/core/drift`. (Task 2 fills in `confidenceForAxis`; this task ships `SOURCE_QUALITY`, `sourceQuality`, and `recencyWeight`.)

- [ ] **Step 1: Install Vitest in `@kyc/core`**

Run:
```bash
pnpm --filter @kyc/core add -D vitest
```
Then add these scripts to `packages/core/package.json` (in the existing `"scripts"` block, after `"check"`):
```json
    "test": "vitest run",
    "test:watch": "vitest",
```
And add a root `test` script to `package.json` (after `"check"`):
```json
    "test": "pnpm -r run test",
```

- [ ] **Step 2: Write the failing test**

Create `packages/core/src/drift/confidence.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SourceSchema } from "../schemas/index.ts";
import { SOURCE_QUALITY, recencyWeight, sourceQuality } from "./confidence.ts";

describe("SOURCE_QUALITY", () => {
  it("has a prior for every Source enum value", () => {
    for (const source of SourceSchema.options) {
      expect(SOURCE_QUALITY[source]).toBeGreaterThan(0);
      expect(SOURCE_QUALITY[source]).toBeLessThanOrEqual(1);
    }
  });

  it("ranks regulator-grade sources above news and manual", () => {
    expect(sourceQuality("sec_edgar")).toBeGreaterThan(sourceQuality("eventregistry"));
    expect(sourceQuality("opensanctions")).toBeGreaterThan(sourceQuality("manual"));
  });
});

describe("recencyWeight", () => {
  it("is 1 at asOf and decays toward 0 with age", () => {
    expect(recencyWeight("2026-01-01", "2026-01-01")).toBe(1);
    const oneYear = recencyWeight("2025-01-01", "2026-01-01");
    expect(oneYear).toBeGreaterThan(0.45);
    expect(oneYear).toBeLessThan(0.55); // ~0.5 at the 365-day half-life
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test`
Expected: FAIL — `Cannot find module './confidence.ts'`.

- [ ] **Step 4: Write minimal implementation**

Create `packages/core/src/drift/confidence.ts`:
```ts
import { type Signal, type Source } from "../schemas/index.ts";

/**
 * Per-connector source-quality prior in [0, 1]: how far we trust a source's
 * claims before any corroboration. Regulator/registry feeds are near
 * ground-truth; news and manual entries are softer. The spine of the confidence
 * engine (proposal 1); covers exactly the current Source enum — new sources add
 * their prior here in the phase that introduces their connector.
 */
export const SOURCE_QUALITY: Record<Source, number> = {
  opensanctions: 0.97,
  gleif: 0.95,
  sec_edgar: 0.95,
  opencorporates: 0.85,
  wayback: 0.7,
  eventregistry: 0.7,
  manual: 0.6,
};

/** Source-quality prior for a source, defaulting to a cautious mid value. */
export function sourceQuality(source: Source): number {
  return SOURCE_QUALITY[source] ?? 0.6;
}

/** Recency half-life in days — structural drift persists ~a year. */
const HALF_LIFE_DAYS = 365;
const MS_PER_DAY = 86_400_000;

/**
 * Exponential recency weight in (0, 1]: 1 at (or after) `asOf`, halving every
 * HALF_LIFE_DAYS. Shared by the cheap-tier score (freshness of evidence) and the
 * confidence engine's freshness term.
 */
export function recencyWeight(signalDate: string, asOf: string): number {
  const ageDays = (Date.parse(asOf) - Date.parse(signalDate)) / MS_PER_DAY;
  if (Number.isNaN(ageDays) || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/**
 * Confidence on an axis as an explicit weighted blend (proposal 1), replacing
 * the old single-signal max-of-confidences proxy:
 *
 *   0.40·source quality + 0.25·corroboration + 0.20·freshness + 0.15·historical
 *
 * `historical accuracy` has no live track record in demo scope, so it is stubbed
 * as the source-quality prior (a second source-quality term) until the
 * outcome-feedback loop (proposal 13) supplies realized outcomes. Risk and
 * confidence stay separate: this writes AxisDrift.confidence only.
 */
export function confidenceForAxis(signals: Signal[], asOf: string): number {
  if (signals.length === 0) return 0;
  let quality = 0;
  let freshness = 0;
  const sources = new Set<Source>();
  for (const s of signals) {
    quality = Math.max(quality, sourceQuality(s.source));
    freshness = Math.max(freshness, recencyWeight(s.date, asOf));
    sources.add(s.source);
  }
  // Independent corroboration: 1 source → 0, 2 → 0.5, 3+ → 1.
  const corroboration = Math.min(1, (sources.size - 1) / 2);
  const historical = quality; // stub; populated by proposal 13.
  return 0.4 * quality + 0.25 * corroboration + 0.2 * freshness + 0.15 * historical;
}
```

Then add to `packages/core/src/drift/index.ts` (after the existing line):
```ts
export * from "./confidence.ts";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test`
Expected: PASS (both describe blocks green).

- [ ] **Step 6: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
Expected: all green.
```bash
git add packages/core/package.json packages/core/src/drift/confidence.ts packages/core/src/drift/confidence.test.ts packages/core/src/drift/index.ts package.json pnpm-lock.yaml
git commit -m "Add Vitest runner and SOURCE_QUALITY confidence priors"
```

---

### Task 2: Wire the confidence engine into the cheap-tier score (proposal 1)

**Files:**
- Modify: `packages/core/src/drift/score.ts` (drop the local recency helper + max-of-confidences; use `recencyWeight`/`confidenceForAxis` from `confidence.ts`)
- Create: `packages/core/src/drift/score.test.ts`
- Modify: `packages/core/src/drift/confidence.test.ts` (add `confidenceForAxis` cases)

**Interfaces:**
- Consumes: `recencyWeight`, `confidenceForAxis`, `sourceQuality` from `./confidence.ts`.
- Produces: unchanged public signatures `scoreAxis(signals, asOf)` and `scoreDriftVector(baseline, signals, options)` — only the `confidence` field of each `AxisDrift` changes value.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/drift/confidence.test.ts`:
```ts
import { confidenceForAxis } from "./confidence.ts";
import type { Signal } from "../schemas/index.ts";

function sig(over: Partial<Signal>): Signal {
  return {
    id: "s1",
    entityId: "e1",
    axis: "reputation",
    type: "adverse_media",
    date: "2026-01-01",
    sourceUrl: "https://example.com/a",
    title: "t",
    source: "eventregistry",
    payload: {},
    confidence: 0.6,
    ...over,
  };
}

describe("confidenceForAxis", () => {
  it("is 0 for no signals", () => {
    expect(confidenceForAxis([], "2026-01-01")).toBe(0);
  });

  it("rises with independent corroboration from distinct sources", () => {
    const asOf = "2026-01-01";
    const one = confidenceForAxis([sig({ source: "eventregistry" })], asOf);
    const two = confidenceForAxis(
      [sig({ id: "a", source: "eventregistry" }), sig({ id: "b", source: "sec_edgar" })],
      asOf,
    );
    expect(two).toBeGreaterThan(one);
  });

  it("weights a regulator-grade source above a news source", () => {
    const asOf = "2026-01-01";
    const news = confidenceForAxis([sig({ source: "eventregistry" })], asOf);
    const reg = confidenceForAxis([sig({ source: "sec_edgar" })], asOf);
    expect(reg).toBeGreaterThan(news);
  });
});
```

Create `packages/core/src/drift/score.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { scoreAxis } from "./score.ts";
import { confidenceForAxis } from "./confidence.ts";
import type { Signal } from "../schemas/index.ts";

const base: Signal = {
  id: "s1",
  entityId: "e1",
  axis: "reputation",
  type: "adverse_media",
  date: "2026-01-01",
  sourceUrl: "https://example.com/a",
  title: "headline",
  source: "eventregistry",
  payload: {},
  confidence: 0.6,
};

describe("scoreAxis", () => {
  it("returns the weighted-blend confidence, not the max signal confidence", () => {
    const signals = [base, { ...base, id: "s2", source: "sec_edgar" as const }];
    const result = scoreAxis(signals, "2026-01-01");
    expect(result.confidence).toBeCloseTo(confidenceForAxis(signals, "2026-01-01"), 10);
  });

  it("keeps an empty axis at zero", () => {
    const result = scoreAxis([], "2026-01-01");
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.status).toBe("stable");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kyc/core test`
Expected: `score.test.ts` first case FAILS (current `confidence` is `Math.max` of signal confidences = `0.6`, not the blend).

- [ ] **Step 3: Edit `score.ts` to use the confidence engine**

In `packages/core/src/drift/score.ts`:

Replace the imports block at the top with (add the `confidence.ts` import):
```ts
import {
  AXES,
  DriftVectorSchema,
  type AxisDrift,
  type DriftAxis,
  type DriftVector,
  type KYCBaseline,
  type RiskStatus,
  type Signal,
} from "../schemas/index.ts";
import { confidenceForAxis, recencyWeight } from "./confidence.ts";
```

Delete these now-moved definitions (they live in `confidence.ts` now):
```ts
/** Recency half-life in days — structural drift persists ~a year. */
const HALF_LIFE_DAYS = 365;
```
```ts
const MS_PER_DAY = 86_400_000;
```
```ts
function recencyWeight(signalDate: string, asOf: string): number {
  const ageDays = (Date.parse(asOf) - Date.parse(signalDate)) / MS_PER_DAY;
  if (Number.isNaN(ageDays) || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}
```
(Keep `SATURATION_K`, `ALERT_THRESHOLD`, `WATCH_THRESHOLD`, `statusForScore`, and `clusterBonus`.)

Replace the body of `scoreAxis` with (drops `maxConfidence`, calls `confidenceForAxis`):
```ts
/** Score a single axis from the signals attributed to it. */
export function scoreAxis(signals: Signal[], asOf: string): AxisDrift {
  if (signals.length === 0) {
    return { score: 0, confidence: 0, status: "stable", tierReached: "stage0", signalIds: [] };
  }

  let weighted = 0;
  const sorted = [...signals].sort((a, b) => b.date.localeCompare(a.date));
  for (const s of sorted) {
    weighted += s.confidence * recencyWeight(s.date, asOf) * clusterBonus(s);
  }

  const score = 1 - Math.exp(-weighted / SATURATION_K);
  const latest = sorted[0]!;
  return {
    score,
    confidence: confidenceForAxis(sorted, asOf),
    status: statusForScore(score),
    tierReached: "stage0",
    signalIds: sorted.map((s) => s.id),
    reasoning: `${signals.length} signal(s); latest: "${latest.title}" (${latest.date.slice(0, 10)}).`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kyc/core test`
Expected: PASS (all confidence + score cases green).

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
Expected: all green.
```bash
git add packages/core/src/drift/score.ts packages/core/src/drift/score.test.ts packages/core/src/drift/confidence.test.ts
git commit -m "Score axis confidence via weighted blend instead of max-of-signals"
```

---

### Task 3: Delta-escalation gate + prior-composite selector (proposal 2, core)

**Files:**
- Modify: `packages/core/src/pipeline/escalate.ts`
- Create: `packages/core/src/pipeline/escalate.test.ts`

**Interfaces:**
- Produces:
  - `ESCALATION_DELTA: number`
  - `escalationGate(composite: number, status: RiskStatus, priorComposite?: number, delta?: number): { escalated: boolean; reason: string }`
  - `priorComposite(entries: AuditEntry[], entityId: string): number | undefined`
  - `RunEscalationParams` gains optional `priorComposite?: number`
  - `EscalationResult` gains `escalationReason: string`
- Consumes (Task 4): `priorComposite`, the new param, and `escalationReason` from `@kyc/core/pipeline`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/pipeline/escalate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ESCALATION_DELTA, escalationGate, priorComposite } from "./escalate.ts";
import type { AuditEntry } from "../schemas/index.ts";

describe("escalationGate", () => {
  it("escalates on an absolute alert regardless of prior", () => {
    expect(escalationGate(0.8, "alert").escalated).toBe(true);
  });

  it("escalates below threshold when the composite jumps by the delta", () => {
    const prior = 0.4;
    const now = prior + ESCALATION_DELTA;
    const gate = escalationGate(now, "watch", prior);
    expect(gate.escalated).toBe(true);
    expect(gate.reason).toMatch(/jump/i);
  });

  it("does not escalate below threshold on a small jump", () => {
    expect(escalationGate(0.45, "watch", 0.4).escalated).toBe(false);
  });

  it("is byte-for-byte the old gate when no prior is supplied", () => {
    expect(escalationGate(0.5, "watch").escalated).toBe(false);
    expect(escalationGate(0.7, "alert").escalated).toBe(true);
  });
});

describe("priorComposite", () => {
  const entry = (over: Partial<Extract<AuditEntry, { kind: "drift_evaluated" }>>): AuditEntry => ({
    id: "x",
    ts: "2026-01-01T00:00:00Z",
    entityId: "e1",
    kind: "drift_evaluated",
    tier: "stage1",
    score: 0.5,
    confidence: 0.5,
    ...over,
  });

  it("returns the latest composite-level (axis-omitted) score for the entity", () => {
    const entries: AuditEntry[] = [
      entry({ ts: "2026-01-01T00:00:00Z", score: 0.3 }),
      entry({ ts: "2026-02-01T00:00:00Z", score: 0.6 }),
      entry({ ts: "2026-03-01T00:00:00Z", axis: "reputation", score: 0.9 }), // axis-level, ignored
    ];
    expect(priorComposite(entries, "e1")).toBe(0.6);
  });

  it("ignores other entities and returns undefined when none", () => {
    expect(priorComposite([entry({ entityId: "other" })], "e1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test escalate`
Expected: FAIL — `escalationGate`/`priorComposite`/`ESCALATION_DELTA` not exported.

- [ ] **Step 3: Implement in `escalate.ts`**

Add `AuditEntry` to the schema import and `RiskStatus` (used by the gate). Change the top import block:
```ts
import {
  AXES,
  type Alert,
  type AuditEntry,
  type DriftAxis,
  type DriftVector,
  type KYCBaseline,
  type PatternArchetype,
  type RiskStatus,
  type Signal,
} from "../schemas/index.ts";
```

Add, just above `export interface RunEscalationParams`:
```ts
/** Minimum composite jump since the last evaluation that escalates on its own. */
export const ESCALATION_DELTA = 0.15;

export interface EscalationGate {
  escalated: boolean;
  reason: string;
}

/**
 * Change-triggered escalation (proposal 2): fire Stage 3 on an absolute alert,
 * OR when the composite jumps by `delta` since the prior evaluation even below
 * the absolute threshold. With no `priorComposite` this is byte-for-byte the
 * original level-only gate, so every existing caller is unchanged.
 */
export function escalationGate(
  composite: number,
  status: RiskStatus,
  priorComposite?: number,
  delta = ESCALATION_DELTA,
): EscalationGate {
  if (status === "alert") {
    return { escalated: true, reason: `Composite ${composite.toFixed(2)} crossed the alert threshold.` };
  }
  if (priorComposite !== undefined && composite - priorComposite >= delta) {
    return {
      escalated: true,
      reason: `Composite jumped ${(composite - priorComposite).toFixed(2)} (${priorComposite.toFixed(2)} → ${composite.toFixed(2)}), exceeding the ${delta} delta.`,
    };
  }
  return { escalated: false, reason: `Composite ${composite.toFixed(2)} below the alert threshold.` };
}

/**
 * Most-recent composite-level (`axis` omitted) `drift_evaluated` score for an
 * entity, or undefined if none. The caller owns the audit log and passes the
 * result into `runEscalation` as `priorComposite`, keeping escalation
 * side-effect-free.
 */
export function priorComposite(entries: AuditEntry[], entityId: string): number | undefined {
  let latest: { ts: string; score: number } | undefined;
  for (const e of entries) {
    if (e.kind === "drift_evaluated" && e.entityId === entityId && e.axis === undefined) {
      if (!latest || e.ts > latest.ts) latest = { ts: e.ts, score: e.score };
    }
  }
  return latest?.score;
}
```

Add the optional field to `RunEscalationParams` (after `alertId?`):
```ts
  /** Prior composite from the last evaluation; enables change-triggered escalation. */
  priorComposite?: number;
```

Add to `EscalationResult` (after `cost`):
```ts
  /** Why Stage 3 did or did not fire (level-cross vs delta-cross). */
  escalationReason: string;
```

In `runEscalation`, replace:
```ts
  const escalated = drift.status === "alert";
  if (!escalated) {
    return { drift, drifting, stage2, escalated, cost };
  }
```
with:
```ts
  const gate = escalationGate(drift.composite, drift.status, params.priorComposite);
  const escalated = gate.escalated;
  if (!escalated) {
    return { drift, drifting, stage2, escalated, escalationReason: gate.reason, cost };
  }
```
and update the final `return` to include the reason:
```ts
  return {
    drift,
    drifting,
    stage2,
    escalated,
    escalationReason: gate.reason,
    stage3: { alert, usage, model },
    cost,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kyc/core test escalate`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
Expected: all green.
```bash
git add packages/core/src/pipeline/escalate.ts packages/core/src/pipeline/escalate.test.ts
git commit -m "Add change-triggered delta escalation gate and prior-composite selector"
```

---

### Task 4: Wire delta alerting into the live app (proposal 2, app)

**Files:**
- Modify: `apps/web/src/lib/server/analyze.ts`

**Interfaces:**
- Consumes: `priorComposite` from `@kyc/core/pipeline`; `listAudit` from `./audit`; `AXES` from `@kyc/core`.
- Produces: a composite-level `drift_evaluated` audit entry per run + `priorComposite`-driven escalation.

> No unit test: `analyzeEntity` reads/writes the real `data/audit.jsonl` and there is no app-test harness. The escalation logic it relies on is fully tested in Task 3; this task is verified by `pnpm check` + a manual smoke.

- [ ] **Step 1: Read the prior composite and pass it in**

In `apps/web/src/lib/server/analyze.ts`, extend the core import:
```ts
import type { Alert, DriftAxis } from '@kyc/core';
import { AXES } from '@kyc/core';
import { priorComposite, runEscalation, type AxisMateriality, type EscalationCost } from '@kyc/core/pipeline';
```
and add `listAudit` to the audit import:
```ts
import { appendAudit, listAudit } from './audit';
```

Just before the `runEscalation` call, read the prior composite:
```ts
	const prior = priorComposite(listAudit(entityId, 500), entityId);
```
Add `priorComposite: prior` to the `runEscalation({...})` params (after `alertId`):
```ts
		alertId: `alert-${entityId}-${Date.now()}`,
		priorComposite: prior
```

- [ ] **Step 2: Record the composite-level Stage-1 evaluation each run**

Immediately after the `runEscalation` call returns (before the Stage-2 loop), append a composite-level `drift_evaluated` entry so future runs have a prior to compare against:
```ts
	// Stage 1 — record the composite-level evaluation (axis omitted) so later runs
	// can detect a delta-triggered jump (proposal 2).
	const compositeConfidence = Math.max(...AXES.map((a) => result.drift.axes[a].confidence));
	appendAudit({
		id: randomUUID(),
		ts: now(),
		entityId,
		kind: 'drift_evaluated',
		tier: 'stage1',
		score: result.drift.composite,
		confidence: compositeConfidence
	});
```

- [ ] **Step 3: Use the core-supplied escalation reason**

Replace the `reason:` ternary in the `escalation_decision` append with the reason from core:
```ts
		kind: 'escalation_decision',
		composite: result.drift.composite,
		escalated: result.escalated,
		reason: result.escalationReason
```

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: PASS (no type errors in `@kyc/web`).

- [ ] **Step 5: Manual smoke**

Run: `pnpm dev`, open the app, select an entity and advance the demo clock so it analyzes twice.
Expected: `data/audit.jsonl` gains a composite-level `drift_evaluated` entry (an entry with `kind: "drift_evaluated"` and **no** `axis`) on each run; a sub-0.7 run that jumped ≥0.15 since the prior shows an `escalation_decision` whose `reason` contains "jumped". Then stop the server (Ctrl-C).

> Note: this writes real entries to `data/audit.jsonl`. If you want a clean log for the demo, `git checkout data/audit.jsonl` after smoking.

- [ ] **Step 6: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/web run fix && pnpm lint`
Expected: all green.
```bash
git checkout data/audit.jsonl   # discard smoke-test entries
git add apps/web/src/lib/server/analyze.ts
git commit -m "Feed prior composite into escalation; log composite-level drift each run"
```

---

### Task 5: Cross-source dedup with a fingerprint key (proposal 9)

**Files:**
- Create: `packages/core/src/connectors/dedup.ts`
- Create: `packages/core/src/connectors/dedup.test.ts`
- Modify: `packages/core/src/connectors/eventRegistry.ts` (delegate `dedupeByEvent` to the new generic dedup; drop its local `DedupeResult`)
- Modify: `packages/core/src/connectors/index.ts` (export the new module)

**Interfaces:**
- Produces: `fingerprint(text: string): string`, `dedupeSignals(signals: Signal[]): DedupeResult`, `DedupeResult { signals: Signal[]; rawCount: number }` — from `@kyc/core/connectors`.
- Changes: `dedupeByEvent(signals)` now delegates to `dedupeSignals` (clusters across sources by `eventUri` → `sourceUrl` → title fingerprint, and keeps the **highest-confidence** representative instead of the earliest-dated).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connectors/dedup.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { dedupeSignals, fingerprint } from "./dedup.ts";
import type { Signal } from "../schemas/index.ts";

function sig(over: Partial<Signal>): Signal {
  return {
    id: "s",
    entityId: "e1",
    axis: "business_model",
    type: "business_model_change",
    date: "2026-01-01",
    sourceUrl: "https://example.com/a",
    title: "Acme rebrands to Acme Blockchain",
    source: "eventregistry",
    payload: {},
    confidence: 0.6,
    ...over,
  };
}

describe("fingerprint", () => {
  it("ignores case and punctuation", () => {
    expect(fingerprint("Acme Rebrands!")).toBe(fingerprint("acme   rebrands"));
  });
});

describe("dedupeSignals", () => {
  it("collapses signals sharing an eventUri", () => {
    const r = dedupeSignals([
      sig({ id: "a", payload: { eventUri: "ev1" } }),
      sig({ id: "b", sourceUrl: "https://example.com/b", payload: { eventUri: "ev1" } }),
    ]);
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]!.payload.clusterSize).toBe(2);
  });

  it("collapses an 8-K and a news article on the same headline across sources, keeping the highest-confidence representative", () => {
    const r = dedupeSignals([
      sig({ id: "news", source: "eventregistry", sourceUrl: "https://news.example/x", confidence: 0.6 }),
      sig({ id: "filing", source: "sec_edgar", sourceUrl: "https://sec.example/y", confidence: 0.95 }),
    ]);
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]!.id).toBe("filing");
    expect(r.signals[0]!.payload.clusterSize).toBe(2);
  });

  it("keeps genuinely distinct events separate", () => {
    const r = dedupeSignals([
      sig({ id: "a", title: "Acme rebrands", sourceUrl: "https://example.com/a" }),
      sig({ id: "b", title: "Acme raises Series C funding", sourceUrl: "https://example.com/b" }),
    ]);
    expect(r.signals).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kyc/core test dedup`
Expected: FAIL — `./dedup.ts` does not exist.

- [ ] **Step 3: Implement `dedup.ts`**

Create `packages/core/src/connectors/dedup.ts`:
```ts
import { createHash } from "node:crypto";
import { type Signal } from "../schemas/index.ts";

export interface DedupeResult {
  signals: Signal[];
  /** How many raw signals went in (before clustering). */
  rawCount: number;
}

/** Normalised text fingerprint: lowercased, punctuation-stripped, first ~1k chars. */
export function fingerprint(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
  return createHash("md5").update(normalized).digest("hex");
}

/**
 * Collapse signals describing the same underlying event into one — generalising
 * the EventRegistry-only `dedupeByEvent` to cluster ACROSS sources (proposal 9).
 * Two signals join the same cluster if they share ANY of: `eventUri`,
 * `sourceUrl`, or a normalised title fingerprint — so an 8-K and the article
 * reporting the same event collapse. Keeps the highest-confidence signal as the
 * representative (ties broken by earliest date) and records `clusterSize` on it.
 *
 * Caveat: signals carry only a `title` (not full body), so the fingerprint
 * clusters near-identical headlines; events reported under very different
 * headlines still rely on `eventUri`/`sourceUrl`.
 */
export function dedupeSignals(signals: Signal[]): DedupeResult {
  const n = signals.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const keyOwner = new Map<string, number>();
  signals.forEach((s, i) => {
    const keys: string[] = [];
    const eventUri = s.payload.eventUri as string | null | undefined;
    if (eventUri) keys.push(`event:${eventUri}`);
    keys.push(`url:${s.sourceUrl}`, `fp:${fingerprint(s.title)}`);
    for (const k of keys) {
      const owner = keyOwner.get(k);
      if (owner === undefined) keyOwner.set(k, i);
      else union(i, owner);
    }
  });

  const groups = new Map<number, Signal[]>();
  signals.forEach((s, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(s);
    else groups.set(root, [s]);
  });

  const out: Signal[] = [...groups.values()].map((group) => {
    const rep = [...group].sort(
      (a, b) => b.confidence - a.confidence || a.date.localeCompare(b.date),
    )[0]!;
    return { ...rep, payload: { ...rep.payload, clusterSize: group.length } };
  });

  return { signals: out, rawCount: n };
}
```

- [ ] **Step 4: Delegate `dedupeByEvent` to the generic dedup**

In `packages/core/src/connectors/eventRegistry.ts`:

Add to the top imports:
```ts
import { dedupeSignals, type DedupeResult } from "./dedup.ts";
```

Delete the local `DedupeResult` interface:
```ts
export interface DedupeResult {
  signals: Signal[];
  /** How many raw signals went in (before clustering). */
  rawCount: number;
}
```

Replace the `dedupeByEvent` function body with a delegation (keep the export name for back-compat with the extract scripts):
```ts
/**
 * Back-compat alias: collapse same-event signals. Now delegates to the generic
 * cross-source `dedupeSignals` (proposal 9) — clusters by eventUri, sourceUrl or
 * title fingerprint and keeps the highest-confidence representative.
 */
export function dedupeByEvent(signals: Signal[]): DedupeResult {
  return dedupeSignals(signals);
}
```

Add the dedup module to `packages/core/src/connectors/index.ts`:
```ts
export * from "./dedup.ts";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @kyc/core test`
Expected: PASS (dedup + all prior suites green — full run confirms no regression).

- [ ] **Step 6: Verify, then commit**

Run: `pnpm check && pnpm --filter @kyc/core run fix && pnpm lint`
Expected: all green.
```bash
git add packages/core/src/connectors/dedup.ts packages/core/src/connectors/dedup.test.ts packages/core/src/connectors/eventRegistry.ts packages/core/src/connectors/index.ts
git commit -m "Generalise dedup across sources with a title fingerprint key"
```

---

## Self-Review

**Spec coverage (Phase 0 + Phase 1 scope):**
- Proposal 1 (confidence engine) → Tasks 1–2. ✅ `SOURCE_QUALITY`, weighted blend, stubbed historical term, writes `AxisDrift.confidence` only.
- Proposal 2 (delta alerting) → Tasks 3–4. ✅ optional `priorComposite`, OR-gate, caller owns the log, byte-for-byte default.
- Proposal 9 (cross-source dedup) → Task 5. ✅ fingerprint fallback, cross-source clustering, highest-confidence representative.
- Phase-0 `SOURCE_QUALITY` foundation → Task 1. ✅
- Phase-0 schema additions → **deferred** to the consuming phases (documented in Global Constraints); not required by any Phase-1 proposal. ✅
- Static reference data (FATF/sanctions) → belongs to Phase 2 (consumed by enrichers/screening); not in this plan. ✅

**Placeholder scan:** none — every step has concrete code/commands. ✅

**Type consistency:** `confidenceForAxis(signals, asOf)`, `recencyWeight(date, asOf)`, `escalationGate(composite, status, priorComposite?, delta?)`, `priorComposite(entries, entityId)`, `dedupeSignals(signals): DedupeResult`, `fingerprint(text)` — names/signatures match across the tasks that define and consume them. `EscalationResult.escalationReason` added in Task 3 and consumed in Task 4. ✅
