# Decision Governance (Maker-Checker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-click escalate/dismiss with a two-role maker-checker approval workflow (analyst proposes → compliance approves at a checkpoint), enforced server-side and fully recorded in the append-only audit log.

**Architecture:** Extend the `human_action` audit entry with `role` + broader `decision` + `actor`; add pure, testable `deriveCaseState` + `governanceCheck` helpers in a new `@kyc/core/governance` module; rework the server actions to enforce separation of duties and write the rating change only on approval; make the UI role- and state-aware. Case state is replayed from the audit log — no new storage.

**Tech Stack:** TypeScript, Zod v4, Vitest (core only), SvelteKit (Svelte 5 runes), shadcn-svelte, Tailwind.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-20-decision-governance-design.md`. Two roles (`analyst`, `compliance_officer`); demo role switch (no real auth) enforced **server-side**; rating change (`outcome`) written **only on compliance approval**.
- Refinements on the spec (intentional): the separation-of-duties rule is a pure `governanceCheck()` in core (apps/web has no test runner); the active role is local `+page.svelte` state, not a module store (SSR-safe).
- `packages/core` imports use the `.ts` extension (e.g. `from "./common.ts"`).
- `data/audit.jsonl` is gitignored runtime state — reset it (delete) when the schema changes; it rebuilds on use. No committed data migration.
- Before committing a task that touched code: `pnpm check`, then `pnpm fix`, then `pnpm lint`.
- Commit as the user: `--author="olivierluethy <olivier.luethy@gmx.net>"`, short title, no description block.
- Core tests: `pnpm --filter @kyc/core test -- <file>`.

---

## File Structure

- `packages/core/src/schemas/common.ts` — add `HumanRoleSchema`/`HumanRole`, `HumanDecisionSchema`/`HumanDecision`. (Task 1)
- `packages/core/src/schemas/audit.ts` — rework `HumanActionSchema` (actor/role/decision). (Task 1)
- `packages/core/src/schemas/audit.test.ts` — **new** schema tests. (Task 1)
- `packages/core/src/governance/caseState.ts` — **new** `CaseState`, `deriveCaseState`, `governanceCheck`. (Task 2)
- `packages/core/src/governance/index.ts` — **new** barrel. (Task 2)
- `packages/core/src/governance/caseState.test.ts` — **new** tests. (Task 2)
- `packages/core/package.json` — add `"./governance"` export. (Task 2)
- `apps/web/src/lib/server/audit.ts` — `caseStateFor`; update for renamed field. (Task 3, partial in Task 1)
- `apps/web/src/routes/+page.server.ts` — rework `decide`, add `review`, return `cases`. (Task 1 minimal, Task 3 full)
- `apps/web/src/lib/components/app/AuditDrawer.svelte` — show role/new decisions. (Task 1 compile fix, Task 4 polish)
- `apps/web/src/lib/components/app/TopBar.svelte` — role switch. (Task 4)
- `apps/web/src/lib/components/app/PatternRail.svelte` — state/role-aware controls. (Task 4)
- `apps/web/src/routes/+page.svelte` — role state, cases state, handlers. (Task 4)

---

## Task 1: Audit schema — role, decision, actor

Makes the audit model richer and keeps the app compiling + behaving as today (analyst escalate still writes the outcome; the workflow split comes in Task 3).

**Files:**
- Modify: `packages/core/src/schemas/common.ts`
- Modify: `packages/core/src/schemas/audit.ts`
- Create: `packages/core/src/schemas/audit.test.ts`
- Modify: `apps/web/src/routes/+page.server.ts` (compile fix only)
- Modify: `apps/web/src/lib/components/app/AuditDrawer.svelte` (compile fix only)

**Interfaces:**
- Produces: `HumanRoleSchema`/`type HumanRole` (`"analyst" | "compliance_officer"`), `HumanDecisionSchema`/`type HumanDecision` (`"escalate" | "dismiss" | "approve" | "reject"`), and `HumanActionSchema` with `{ actor: string; role: HumanRole; decision: HumanDecision; rationale: string; alertId?: string }`. All re-exported via `@kyc/core`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/schemas/audit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AuditEntrySchema } from "./audit.ts";

const base = { id: "a1", ts: "2026-06-20T10:00:00.000Z", entityId: "e1" };

describe("HumanActionSchema (via AuditEntrySchema)", () => {
  it("parses a compliance approval with role + actor", () => {
    const e = AuditEntrySchema.parse({
      ...base,
      kind: "human_action",
      actor: "mlro@amina",
      role: "compliance_officer",
      decision: "approve",
      rationale: "Re-KYC authorised.",
    });
    expect(e.kind).toBe("human_action");
    if (e.kind === "human_action") {
      expect(e.role).toBe("compliance_officer");
      expect(e.decision).toBe("approve");
      expect(e.actor).toBe("mlro@amina");
    }
  });

  it("rejects an unknown decision", () => {
    expect(() =>
      AuditEntrySchema.parse({
        ...base,
        kind: "human_action",
        actor: "x",
        role: "analyst",
        decision: "frobnicate",
        rationale: "r",
      }),
    ).toThrow();
  });

  it("rejects an unknown role", () => {
    expect(() =>
      AuditEntrySchema.parse({
        ...base,
        kind: "human_action",
        actor: "x",
        role: "wizard",
        decision: "escalate",
        rationale: "r",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kyc/core test -- audit.test.ts`
Expected: FAIL — schema still has `analyst` / narrow `decision`.

- [ ] **Step 3: Add the enums to `common.ts`**

In `packages/core/src/schemas/common.ts`, after the `RiskRatingSchema` block (around line 26), insert:

```ts
/** Line-of-defence role that performed a human action (governance). */
export const HumanRoleSchema = z.enum(["analyst", "compliance_officer"]);
export type HumanRole = z.infer<typeof HumanRoleSchema>;

/** The human decisions in the maker-checker workflow. */
export const HumanDecisionSchema = z.enum(["escalate", "dismiss", "approve", "reject"]);
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;
```

- [ ] **Step 4: Rework `HumanActionSchema`**

In `packages/core/src/schemas/audit.ts`, update the imports from `./common.ts` to add the two new schemas:

```ts
import {
  Confidence,
  DriftAxisSchema,
  HumanDecisionSchema,
  HumanRoleSchema,
  PipelineStageSchema,
  RiskRatingSchema,
  RiskStatusSchema,
  Score,
  Timestamp,
} from "./common.ts";
```

Then replace the whole `HumanActionSchema` block:

```ts
/** A human acted at the HITL gate. */
export const HumanActionSchema = z.object({
  ...auditBase,
  kind: z.literal("human_action"),
  analyst: z.string().min(1),
  decision: z.enum(["escalate", "dismiss"]),
  rationale: z.string().min(1),
  alertId: z.string().optional(),
});
```

with:

```ts
/** A human acted in the maker-checker workflow (analyst or compliance). */
export const HumanActionSchema = z.object({
  ...auditBase,
  kind: z.literal("human_action"),
  /** Who acted, e.g. "analyst@amina" / "mlro@amina". */
  actor: z.string().min(1),
  /** Line-of-defence role — drives separation of duties. */
  role: HumanRoleSchema,
  decision: HumanDecisionSchema,
  rationale: z.string().min(1),
  alertId: z.string().optional(),
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @kyc/core test -- audit.test.ts`
Expected: PASS.

- [ ] **Step 6: Fix the two web references so the app still compiles**

6a. In `apps/web/src/routes/+page.server.ts`, the `decide` action's `appendAudit` call currently sets `analyst`. Replace that object's identity fields. Change:

```ts
		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'human_action',
			analyst: 'analyst@amina',
			decision,
			rationale
		});
```

to:

```ts
		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'human_action',
			actor: 'analyst@amina',
			role: 'analyst',
			decision,
			rationale
		});
```

6b. In `apps/web/src/lib/components/app/AuditDrawer.svelte`, update the `human_action` summary line. Change:

```ts
			case 'human_action':
				return `${e.decision} · ${e.analyst} · ${e.rationale}`;
```

to:

```ts
			case 'human_action':
				return `${e.decision} · ${e.role} · ${e.actor} · ${e.rationale}`;
```

- [ ] **Step 7: Reset the gitignored runtime log (old-shape entries)**

Run: `rm -f data/audit.jsonl`
(The file is gitignored and rebuilds when an analyst acts.)

- [ ] **Step 8: Typecheck, then commit**

Run: `pnpm check`
Expected: 0 errors.

```bash
git add packages/core/src/schemas/common.ts packages/core/src/schemas/audit.ts packages/core/src/schemas/audit.test.ts apps/web/src/routes/+page.server.ts apps/web/src/lib/components/app/AuditDrawer.svelte
git commit -m "Extend audit human_action with role and approve/reject" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 2: Governance helpers (deriveCaseState + governanceCheck)

**Files:**
- Create: `packages/core/src/governance/caseState.ts`
- Create: `packages/core/src/governance/index.ts`
- Create: `packages/core/src/governance/caseState.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Consumes: `type AuditEntry` from `../schemas/index.ts`; `type HumanRole`, `type HumanDecision` from `../schemas/index.ts`.
- Produces:
  - `type CaseStatus = "open" | "pending_approval" | "approved" | "dismissed"`
  - `interface CaseState { status: CaseStatus; last?: { actor: string; role: HumanRole; decision: HumanDecision; rationale: string; ts: string } }`
  - `deriveCaseState(entries: AuditEntry[]): CaseState` — entries in chronological order.
  - `governanceCheck(role: HumanRole, decision: HumanDecision, status: CaseStatus): { ok: boolean; reason?: string }`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/governance/caseState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveCaseState, governanceCheck } from "./caseState.ts";
import type { AuditEntry } from "../schemas/index.ts";

let n = 0;
function action(decision: string, role: string): AuditEntry {
  n += 1;
  return {
    id: `h${n}`,
    ts: `2026-06-20T10:0${n}:00.000Z`,
    entityId: "e1",
    kind: "human_action",
    actor: role === "compliance_officer" ? "mlro@amina" : "analyst@amina",
    role,
    decision,
    rationale: "r",
  } as AuditEntry;
}

describe("deriveCaseState", () => {
  it("is open with no human actions", () => {
    expect(deriveCaseState([]).status).toBe("open");
  });
  it("is pending_approval after an escalate", () => {
    expect(deriveCaseState([action("escalate", "analyst")]).status).toBe("pending_approval");
  });
  it("is approved after escalate + approve", () => {
    const s = deriveCaseState([action("escalate", "analyst"), action("approve", "compliance_officer")]);
    expect(s.status).toBe("approved");
    expect(s.last?.role).toBe("compliance_officer");
  });
  it("returns to open after a reject", () => {
    const s = deriveCaseState([action("escalate", "analyst"), action("reject", "compliance_officer")]);
    expect(s.status).toBe("open");
    expect(s.last?.decision).toBe("reject");
  });
  it("is dismissed after a dismiss", () => {
    expect(deriveCaseState([action("dismiss", "analyst")]).status).toBe("dismissed");
  });
  it("can re-escalate after a reject", () => {
    const s = deriveCaseState([
      action("escalate", "analyst"),
      action("reject", "compliance_officer"),
      action("escalate", "analyst"),
    ]);
    expect(s.status).toBe("pending_approval");
  });
});

describe("governanceCheck (separation of duties)", () => {
  it("lets an analyst escalate an open case", () => {
    expect(governanceCheck("analyst", "escalate", "open").ok).toBe(true);
  });
  it("blocks an analyst from approving", () => {
    expect(governanceCheck("analyst", "approve", "pending_approval").ok).toBe(false);
  });
  it("lets compliance approve a pending case", () => {
    expect(governanceCheck("compliance_officer", "approve", "pending_approval").ok).toBe(true);
  });
  it("blocks approve when nothing is pending", () => {
    expect(governanceCheck("compliance_officer", "approve", "open").ok).toBe(false);
  });
  it("blocks a second escalate while pending", () => {
    expect(governanceCheck("analyst", "escalate", "pending_approval").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @kyc/core test -- caseState.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helpers**

Create `packages/core/src/governance/caseState.ts`:

```ts
import type { AuditEntry, HumanDecision, HumanRole } from "../schemas/index.ts";

/** Resting governance status of an entity's case (a reject resolves to `open`). */
export type CaseStatus = "open" | "pending_approval" | "approved" | "dismissed";

export interface CaseState {
  status: CaseStatus;
  /** The last human_action that determined the status, if any. */
  last?: {
    actor: string;
    role: HumanRole;
    decision: HumanDecision;
    rationale: string;
    ts: string;
  };
}

/**
 * Replay an entity's audit entries (chronological order) into its current
 * governance state. Only `human_action` entries move the state machine:
 * escalate → pending_approval, approve → approved, reject → open, dismiss →
 * dismissed.
 */
export function deriveCaseState(entries: AuditEntry[]): CaseState {
  let status: CaseStatus = "open";
  let last: CaseState["last"];
  for (const e of entries) {
    if (e.kind !== "human_action") continue;
    last = { actor: e.actor, role: e.role, decision: e.decision, rationale: e.rationale, ts: e.ts };
    switch (e.decision) {
      case "escalate":
        status = "pending_approval";
        break;
      case "dismiss":
        status = "dismissed";
        break;
      case "approve":
        status = "approved";
        break;
      case "reject":
        status = "open";
        break;
    }
  }
  return { status, last };
}

/**
 * Separation-of-duties guard. Analysts may escalate/dismiss an actionable case;
 * only compliance may approve/reject, and only while a case is pending. Returns
 * `{ ok, reason? }` so the server can map a failure to a 403.
 */
export function governanceCheck(
  role: HumanRole,
  decision: HumanDecision,
  status: CaseStatus,
): { ok: boolean; reason?: string } {
  if (decision === "escalate" || decision === "dismiss") {
    if (role !== "analyst") return { ok: false, reason: "Only an analyst may escalate or dismiss." };
    if (status === "pending_approval")
      return { ok: false, reason: "Case already pending compliance approval." };
    if (status === "approved") return { ok: false, reason: "Case already approved." };
    return { ok: true };
  }
  // approve / reject
  if (role !== "compliance_officer")
    return { ok: false, reason: "Only a compliance officer may approve or reject." };
  if (status !== "pending_approval")
    return { ok: false, reason: "No pending approval to act on." };
  return { ok: true };
}
```

- [ ] **Step 4: Create the barrel**

Create `packages/core/src/governance/index.ts`:

```ts
export * from "./caseState.ts";
```

- [ ] **Step 5: Add the package export**

In `packages/core/package.json`, add to the `exports` map (after the `"./drift"` line):

```json
    "./governance": "./src/governance/index.ts",
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @kyc/core test -- caseState.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Typecheck, then commit**

Run: `pnpm check`
Expected: 0 errors.

```bash
git add packages/core/src/governance packages/core/package.json
git commit -m "Add governance case-state and separation-of-duties helpers" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 3: Server — maker-checker actions

**Files:**
- Modify: `apps/web/src/lib/server/audit.ts`
- Modify: `apps/web/src/routes/+page.server.ts`

**Interfaces:**
- Consumes: `deriveCaseState`, `governanceCheck`, `type CaseState` from `@kyc/core/governance`; `type HumanRole`, `type HumanDecision` from `@kyc/core`; `fail` from `@sveltejs/kit`.
- Produces: `caseStateFor(entityId): CaseState` in `audit.ts`; `load` returns `cases: Record<string, CaseState>`; `decide` (escalate/dismiss, **no outcome**) and new `review` (approve/reject, outcome on approve) actions, both returning `{ case: CaseState, rating, auditCount, audit }`.

- [ ] **Step 1: Add `caseStateFor` to the audit server**

In `apps/web/src/lib/server/audit.ts`:

1a. Update the imports. Change:

```ts
import { AuditEntrySchema, type AuditEntry, type RiskRating } from '@kyc/core';
```

to:

```ts
import { AuditEntrySchema, type AuditEntry, type RiskRating } from '@kyc/core';
import { deriveCaseState, type CaseState } from '@kyc/core/governance';
```

1b. Append at the end of the file:

```ts
/** Current governance case state for an entity, replayed from the log (chronological). */
export function caseStateFor(entityId: string): CaseState {
	const entries = readLines()
		.map((l) => AuditEntrySchema.parse(JSON.parse(l)))
		.filter((e) => e.entityId === entityId);
	return deriveCaseState(entries);
}
```

- [ ] **Step 2: Rework `+page.server.ts`**

2a. Update imports. Change:

```ts
import { randomUUID } from 'node:crypto';
import type { RiskRating } from '@kyc/core';
import { loadBook, loadPatternLibrary } from '$lib/server/data';
import { analyzeEntity } from '$lib/server/analyze';
import { appendAudit, auditCount, currentRating, listAudit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';
```

to:

```ts
import { randomUUID } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import type { HumanDecision, HumanRole, RiskRating } from '@kyc/core';
import { governanceCheck } from '@kyc/core/governance';
import { loadBook, loadPatternLibrary } from '$lib/server/data';
import { analyzeEntity } from '$lib/server/analyze';
import {
	appendAudit,
	auditCount,
	caseStateFor,
	currentRating,
	listAudit
} from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';
```

2b. In `load`, add a `cases` map next to `ratings`. After the `ratings` loop and before the `return`, insert:

```ts
	// Governance case state per entity, replayed from the audit log.
	const cases = Object.fromEntries(
		book.map((e) => [e.baseline.entityId, caseStateFor(e.baseline.entityId)])
	);
```

and add `cases` to the returned object (after `ratings,`):

```ts
		ratings,
		cases,
```

2c. Replace the entire `decide` action and add a `review` action. Replace this block:

```ts
	// Human-in-the-loop gate: the analyst's escalate/dismiss decision is written
	// to the append-only audit log before any risk-rating change. Escalation
	// then writes the outcome — the actual rating change.
	decide: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const decision = form.get('decision') === 'escalate' ? 'escalate' : 'dismiss';
		const rationale =
			String(form.get('rationale') ?? '').trim() ||
			(decision === 'escalate'
				? 'Confirmed structural drift; re-KYC required.'
				: 'Reviewed; no action.');

		const baseRating =
			loadBook().find((e) => e.baseline.entityId === entityId)?.baseline.riskRating ?? 'low';

		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'human_action',
			actor: 'analyst@amina',
			role: 'analyst',
			decision,
			rationale
		});

		let rating = currentRating(entityId, baseRating);
		if (decision === 'escalate' && rating !== 'high') {
			appendAudit({
				id: randomUUID(),
				ts: now(),
				entityId,
				kind: 'outcome',
				fromRating: rating,
				toRating: 'high',
				newStatus: 'alert'
			});
			rating = 'high';
		}

		return { decided: decision, rating, auditCount: auditCount(), audit: listAudit(undefined, 40) };
	}
```

with:

```ts
	// Maker step (analyst): propose an escalation or dismiss. Escalation moves the
	// case to pending compliance approval — it does NOT change the rating here.
	decide: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const role = String(form.get('role')) as HumanRole;
		const decision = (form.get('decision') === 'escalate' ? 'escalate' : 'dismiss') as HumanDecision;
		const rationale =
			String(form.get('rationale') ?? '').trim() ||
			(decision === 'escalate'
				? 'Structural drift observed; escalating for compliance review.'
				: 'Reviewed; no action.');

		const check = governanceCheck(role, decision, caseStateFor(entityId).status);
		if (!check.ok) return fail(403, { error: check.reason });

		const baseRating =
			loadBook().find((e) => e.baseline.entityId === entityId)?.baseline.riskRating ?? 'low';

		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'human_action',
			actor: 'analyst@amina',
			role: 'analyst',
			decision,
			rationale
		});

		return {
			case: caseStateFor(entityId),
			rating: currentRating(entityId, baseRating),
			auditCount: auditCount(),
			audit: listAudit(undefined, 40)
		};
	},

	// Checker step (compliance officer): approve or reject a pending escalation.
	// Approval is the checkpoint that writes the actual rating change (outcome).
	review: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const role = String(form.get('role')) as HumanRole;
		const decision = (form.get('decision') === 'approve' ? 'approve' : 'reject') as HumanDecision;
		const rationale =
			String(form.get('rationale') ?? '').trim() ||
			(decision === 'approve'
				? 'Escalation confirmed; re-KYC authorised.'
				: 'Returned to analyst; insufficient basis.');

		const check = governanceCheck(role, decision, caseStateFor(entityId).status);
		if (!check.ok) return fail(403, { error: check.reason });

		const baseRating =
			loadBook().find((e) => e.baseline.entityId === entityId)?.baseline.riskRating ?? 'low';

		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'human_action',
			actor: 'mlro@amina',
			role: 'compliance_officer',
			decision,
			rationale
		});

		let rating = currentRating(entityId, baseRating);
		if (decision === 'approve' && rating !== 'high') {
			appendAudit({
				id: randomUUID(),
				ts: now(),
				entityId,
				kind: 'outcome',
				fromRating: rating,
				toRating: 'high',
				newStatus: 'alert'
			});
			rating = 'high';
		}

		return {
			case: caseStateFor(entityId),
			rating,
			auditCount: auditCount(),
			audit: listAudit(undefined, 40)
		};
	}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: 0 errors. (The separation-of-duties rule is already unit-tested in Task 2; this task is the wiring.)

- [ ] **Step 4: Fix, lint, then commit**

Run: `pnpm fix` then `pnpm lint`
Expected: lint clean.

```bash
git add apps/web/src/lib/server/audit.ts apps/web/src/routes/+page.server.ts
git commit -m "Split escalate/approve into maker-checker server actions" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Task 4: UI — role switch and state-aware controls

**Files:**
- Modify: `apps/web/src/lib/components/app/TopBar.svelte`
- Modify: `apps/web/src/routes/+page.svelte`
- Modify: `apps/web/src/lib/components/app/PatternRail.svelte`

**Interfaces:**
- Consumes: `data.cases` from `load`; `type CaseState` from `@kyc/core/governance`; `type HumanRole` from `@kyc/core`; the `decide`/`review` actions return `{ case, rating, auditCount, audit }`.
- Produces: a role switch in `TopBar`; `PatternRail` rendering `caseState` + `role`-gated controls.

- [ ] **Step 1: Add the role switch to TopBar**

Replace the entire contents of `apps/web/src/lib/components/app/TopBar.svelte` with:

```svelte
<script lang="ts">
	import type { HumanRole } from '@kyc/core';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import ClipboardText from 'phosphor-svelte/lib/ClipboardText';

	let {
		auditCount,
		role,
		onRoleChange,
		onOpenAudit,
		onHome
	}: {
		auditCount: number;
		role: HumanRole;
		onRoleChange: (r: HumanRole) => void;
		onOpenAudit: () => void;
		onHome: () => void;
	} = $props();

	const roles: { id: HumanRole; label: string }[] = [
		{ id: 'analyst', label: 'Analyst' },
		{ id: 'compliance_officer', label: 'Compliance' }
	];
</script>

<header class="border-line flex items-center justify-between border-b pb-3">
	<button
		type="button"
		onclick={onHome}
		aria-label="Go to overview"
		class="flex items-baseline gap-3 rounded-md transition-opacity hover:opacity-70"
	>
		<span class="text-galaxy font-sans text-[15px] font-bold tracking-[0.22em]">AMINA</span>
		<span class="bg-line h-3.5 w-px self-center"></span>
		<span class="text-muted2 text-[11px] tracking-[0.28em] uppercase">KYC-Drift Monitor</span>
	</button>

	<div class="flex items-center gap-3">
		<div
			class="border-line flex items-center gap-0.5 rounded-md border p-0.5"
			role="group"
			aria-label="Active role"
		>
			{#each roles as r (r.id)}
				<button
					type="button"
					onclick={() => onRoleChange(r.id)}
					class={cn(
						'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
						role === r.id ? 'bg-panel2 text-text' : 'text-muted2 hover:text-text'
					)}
					aria-pressed={role === r.id}
				>
					{r.label}
				</button>
			{/each}
		</div>

		<Button
			size="sm"
			class="gap-2 rounded-md px-3 text-[11px] font-medium"
			onclick={onOpenAudit}
			title="Open the append-only audit trail"
		>
			<ClipboardText weight="bold" />
			Audit log
			<span
				class="ml-0.5 rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white"
				>{auditCount}</span
			>
		</Button>
	</div>
</header>
```

- [ ] **Step 2: Wire role + cases state in `+page.svelte`**

2a. Add imports. After `import { scoreDriftVector } from '@kyc/core/drift';` add:

```ts
	import type { HumanRole } from '@kyc/core';
	import type { CaseState } from '@kyc/core/governance';
```

2b. Replace the `decision` state line:

```ts
	let decision = $state<'escalate' | 'dismiss' | null>(null);
```

with:

```ts
	let role = $state<HumanRole>('analyst');
	let cases = $state<Record<string, CaseState>>(untrack(() => data.cases));
```

2c. Replace the `enhanceDecide` handler:

```ts
	// HITL decision → append-only audit log (+ rating outcome on escalate).
	const enhanceDecide: SubmitFunction = () => {
		return async ({ result }: { result: ActionResult }) => {
			if (result.type !== 'success') return;
			const body = result.data ?? {};
			if (body.decided === 'escalate' || body.decided === 'dismiss') decision = body.decided;
			if (typeof body.auditCount === 'number') auditCount = body.auditCount;
			if (Array.isArray(body.audit)) auditEntries = body.audit as typeof auditEntries;
			if (typeof body.rating === 'string')
				ratings = { ...ratings, [selectedId]: body.rating as (typeof ratings)[string] };
		};
	};
```

with:

```ts
	// Governance action (decide/review) → audit log + updated case state + rating.
	const enhanceGov: SubmitFunction = () => {
		return async ({ result }: { result: ActionResult }) => {
			if (result.type !== 'success') return;
			const body = result.data ?? {};
			if (body.case) cases = { ...cases, [selectedId]: body.case as CaseState };
			if (typeof body.auditCount === 'number') auditCount = body.auditCount;
			if (Array.isArray(body.audit)) auditEntries = body.audit as typeof auditEntries;
			if (typeof body.rating === 'string')
				ratings = { ...ratings, [selectedId]: body.rating as (typeof ratings)[string] };
		};
	};
```

2d. In the reset `$effect`, remove the `decision = null;` line (the case now comes from `cases`). Change:

```ts
	$effect(() => {
		void selectedId;
		void asOf;
		decision = null;
		llmNote = null;
		llmCost = null;
	});
```

to:

```ts
	$effect(() => {
		void selectedId;
		void asOf;
		llmNote = null;
		llmCost = null;
	});
```

2e. Update the `TopBar` usage. Change:

```svelte
	<TopBar {auditCount} onOpenAudit={() => (showAudit = true)} onHome={() => (selectedId = '')} />
```

to:

```svelte
	<TopBar
		{auditCount}
		{role}
		onRoleChange={(r) => (role = r)}
		onOpenAudit={() => (showAudit = true)}
		onHome={() => (selectedId = '')}
	/>
```

2f. Update the `PatternRail` usage. Change:

```svelte
			<PatternRail
				entity={selected}
				{archetype}
				{asOfIso}
				{decision}
				{auditCount}
				{llmNote}
				{analyzing}
				{enhanceDecide}
				{enhanceAnalyze}
			/>
```

to:

```svelte
			<PatternRail
				entity={selected}
				{archetype}
				{asOfIso}
				{role}
				caseState={cases[selectedId]}
				{auditCount}
				{llmNote}
				{analyzing}
				enhanceGov={enhanceGov}
				{enhanceAnalyze}
			/>
```

- [ ] **Step 3: Make PatternRail state- and role-aware**

3a. In `apps/web/src/lib/components/app/PatternRail.svelte`, update the script imports + props. Change:

```svelte
	import { AXES, type DriftAxis, type PatternArchetype } from '@kyc/core';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { fmtDate, type BookEntity } from '$lib/view';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let {
		entity,
		archetype,
		asOfIso,
		decision,
		auditCount,
		llmNote,
		analyzing,
		enhanceDecide,
		enhanceAnalyze
	}: {
		entity: BookEntity;
		archetype: PatternArchetype | undefined;
		asOfIso: string;
		decision: 'escalate' | 'dismiss' | null;
		auditCount: number;
		llmNote: string | null;
		analyzing: boolean;
		enhanceDecide: SubmitFunction;
		enhanceAnalyze: SubmitFunction;
	} = $props();
```

to:

```svelte
	import { AXES, type DriftAxis, type HumanRole, type PatternArchetype } from '@kyc/core';
	import type { CaseState } from '@kyc/core/governance';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { fmtDate, type BookEntity } from '$lib/view';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let {
		entity,
		archetype,
		asOfIso,
		role,
		caseState,
		auditCount,
		llmNote,
		analyzing,
		enhanceGov,
		enhanceAnalyze
	}: {
		entity: BookEntity;
		archetype: PatternArchetype | undefined;
		asOfIso: string;
		role: HumanRole;
		caseState: CaseState | undefined;
		auditCount: number;
		llmNote: string | null;
		analyzing: boolean;
		enhanceGov: SubmitFunction;
		enhanceAnalyze: SubmitFunction;
	} = $props();

	const status = $derived(caseState?.status ?? 'open');
	const last = $derived(caseState?.last);
```

3b. Replace the entire human-in-the-loop block — from `<!-- The human-in-the-loop gate — shown only when the composite has crossed. -->` through its closing `{/if}` (the block that starts `{#if isAlert}` near the end) — with:

```svelte
	<!-- Maker-checker governance gate — shown only when the composite has crossed. -->
	{#if isAlert}
		<div class="border-line shrink-0 border-t pt-3">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-muted2 text-[10px] tracking-[0.16em] uppercase">Re-KYC approval</span>
				<span class="text-muted2 font-mono text-[10px]">
					<span style={status !== 'open' ? 'color: var(--text)' : ''}>Maker</span>
					▸
					<span style={status === 'approved' ? 'color: var(--text)' : ''}>Checker</span>
				</span>
			</div>

			{#if status === 'open'}
				{#if role === 'analyst'}
					<div class="flex flex-col gap-2">
						{#if last?.decision === 'reject'}
							<p class="text-[10px] leading-relaxed" style="color: var(--watch)">
								Returned by compliance: {last.rationale}
							</p>
						{/if}
						<form method="POST" action="?/decide" use:enhance={enhanceGov}>
							<input type="hidden" name="entityId" value={entityId} />
							<input type="hidden" name="role" value={role} />
							<input type="hidden" name="decision" value="escalate" />
							<Button type="submit" size="sm" class="w-full rounded-md text-[12px] font-medium">
								Escalate to compliance
							</Button>
						</form>
						<form method="POST" action="?/decide" use:enhance={enhanceGov}>
							<input type="hidden" name="entityId" value={entityId} />
							<input type="hidden" name="role" value={role} />
							<input type="hidden" name="decision" value="dismiss" />
							<Button type="submit" variant="outline" size="sm" class="w-full rounded-md text-[12px]">
								Dismiss
							</Button>
						</form>
					</div>
				{:else}
					<p class="text-muted2 text-[11px] leading-relaxed">Awaiting analyst review.</p>
				{/if}
			{:else if status === 'pending_approval'}
				<div
					class="mb-2 rounded-md px-2.5 py-1.5 text-[11px]"
					style="background: color-mix(in oklab, var(--watch) 10%, transparent); color: var(--watch)"
				>
					Pending compliance approval{last ? ` · raised by ${last.actor}` : ''}
				</div>
				{#if role === 'compliance_officer'}
					<div class="flex flex-col gap-2">
						<form method="POST" action="?/review" use:enhance={enhanceGov}>
							<input type="hidden" name="entityId" value={entityId} />
							<input type="hidden" name="role" value={role} />
							<input type="hidden" name="decision" value="approve" />
							<Button type="submit" size="sm" class="w-full rounded-md text-[12px] font-medium">
								Approve · re-KYC
							</Button>
						</form>
						<form method="POST" action="?/review" use:enhance={enhanceGov}>
							<input type="hidden" name="entityId" value={entityId} />
							<input type="hidden" name="role" value={role} />
							<input type="hidden" name="decision" value="reject" />
							<Button type="submit" variant="outline" size="sm" class="w-full rounded-md text-[12px]">
								Reject · return to analyst
							</Button>
						</form>
					</div>
				{:else}
					<p class="text-muted2 text-[11px] leading-relaxed">
						Awaiting compliance — you raised this; a second person must approve.
					</p>
				{/if}
			{:else if status === 'approved'}
				<div class="flex items-center gap-1.5 text-[11px]">
					<span style="color: var(--brand)">✓</span>
					<span class="text-text">Approved · rating → High{last ? ` by ${last.actor}` : ''}</span>
					<span class="text-muted2 font-mono">· audit #{auditCount}</span>
				</div>
			{:else if status === 'dismissed'}
				<div class="flex items-center gap-1.5 text-[11px]">
					<span class="text-muted2">○</span>
					<span class="text-text">Dismissed{last ? ` by ${last.actor}` : ''}</span>
				</div>
			{/if}

			{#if status === 'open' || status === 'pending_approval'}
				<form method="POST" action="?/analyze" use:enhance={enhanceAnalyze} class="mt-2">
					<input type="hidden" name="entityId" value={entityId} />
					<input type="hidden" name="asOf" value={asOfIso} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						disabled={analyzing}
						class="text-muted2 hover:text-text hover:bg-panel2 w-full rounded-md text-[11px]"
					>
						{analyzing ? 'Analyzing…' : 'Deep analysis · Stage 3'}
					</Button>
				</form>
			{/if}

			{#if llmNote}
				<p class="text-muted2 mt-2 text-[10px] leading-relaxed">{llmNote}</p>
			{/if}
		</div>
	{/if}
```

- [ ] **Step 4: Verify in the browser**

Run: `pnpm check` → 0 errors. With the dev server running (`pnpm --filter @kyc/web dev`):
- Select a customer in `alert` status (e.g. Gulf Bridge Capital). As **Analyst**, the right rail shows **Escalate to compliance / Dismiss**.
- Click **Escalate** → block switches to amber "Pending compliance approval · raised by analyst@amina"; rating unchanged; **as Analyst you see "a second person must approve"** (no approve button — separation of duties).
- Switch the TopBar role to **Compliance** → **Approve · re-KYC / Reject** appear. Click **Approve** → "Approved · rating → High by mlro@amina"; left-rail rating flips to HIGH.
- Open the **Audit log**: entries show `escalate · analyst · analyst@amina …` then `approve · compliance_officer · mlro@amina …` then `rating low → high`.
- Re-select another alert, escalate, switch to Compliance, **Reject** → returns to analyst with the "Returned by compliance" note; rating unchanged.

- [ ] **Step 5: Fix, lint, then commit**

Run: `pnpm fix` then `pnpm lint`
Expected: lint clean.

```bash
git add apps/web/src/lib/components/app/TopBar.svelte apps/web/src/routes/+page.svelte apps/web/src/lib/components/app/PatternRail.svelte
git commit -m "Add maker-checker governance UI with role switch" --author="olivierluethy <olivier.luethy@gmx.net>"
```

---

## Self-Review notes

- **Spec coverage:** §1 roles → Task 4 (switch) + Task 1 (`HumanRole`); §2 lifecycle → Task 2 (`deriveCaseState`); §3 audit model → Task 1 (schema) + Task 2 (deriver) + reset note; §4 server actions + guard → Task 3 (+ Task 2 `governanceCheck`); §5 UI → Task 4; §6 testing → Tasks 1–2. All covered.
- **Placeholder scan:** none — every code step is concrete.
- **Type consistency:** `HumanRole`/`HumanDecision` defined in Task 1, consumed in Tasks 2–4. `CaseState`/`CaseStatus`/`deriveCaseState`/`governanceCheck` defined in Task 2, consumed in Tasks 3–4. Action return `{ case, rating, auditCount, audit }` is identical in Task 3 (server) and Task 4 (`enhanceGov`). PatternRail props (`role`, `caseState`, `enhanceGov`) match the `+page.svelte` usage.
- **Incremental green:** Task 1 keeps the app compiling + behaving (analyst escalate still writes outcome) by fixing the two references; Task 3 then moves the outcome to the approval checkpoint; Task 4 adds the UI. The separation-of-duties guard is unit-tested in Task 2, so Task 3 needs no web test runner.
