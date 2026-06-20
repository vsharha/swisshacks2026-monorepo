# Decision Governance — Maker-Checker Approval — Design

Adds the missing **Decision Governance** layer from the AMINA challenge — *risk
approval workflows, compliance review, manual validation, escalation processes,
and approval checkpoints* — by turning today's single-click escalate/dismiss into
a **two-role maker-checker workflow** with real separation of duties, all visible
in the existing append-only audit log.

## Goal

Today the `decide` action (`apps/web/src/routes/+page.server.ts`) lets one
hardcoded `analyst@amina` both escalate and change the risk rating in a single
click — there is no second-person approval, no intermediate review state, and no
role concept. That fails the challenge's separation-of-duties requirement.

We introduce a **maker (analyst) → checker (compliance officer)** flow. An
analyst *proposes* an escalation; the case enters **pending compliance approval**;
a compliance officer *approves or rejects* at a checkpoint. The risk-rating
change (`outcome`) is written **only on approval**. Everything is replayed from
the hash-chained audit log — no new storage system.

This also introduces a lightweight **role** concept, which is the groundwork for
the RBAC item tracked elsewhere (out of scope here beyond the role switch itself).

## Non-goals

- No real authentication / sessions (role is a demo switch in the UI, enforced
  server-side per request).
- No data masking, encryption, or secure-API work (separate roadmap items).
- No multi-state case queue, assignment, or SLAs (the "full case management"
  option was rejected as over-scope).
- No change to the cost cascade (Stage 0–3) or drift scoring.

## 1. Roles

Two roles: `analyst` and `compliance_officer` (MLRO). A switcher in
`TopBar.svelte` sets the active role, held in a small Svelte store
(`$lib/stores/role.ts`) and submitted as a hidden `role` field on each governance
form. There is no third "viewer" role in this slice.

Separation of duties (enforced server-side, §4):
- only an `analyst` may `escalate` / `dismiss`;
- only a `compliance_officer` may `approve` / `reject`;
- approve/reject are valid only when the case is `pending_approval`.

## 2. Case lifecycle (derived from the audit log)

A "case" is per-entity; its state is **replayed** from the audit entries (same
approach as `currentRating`). States:

```
open ──escalate(analyst)──▶ pending_approval ──approve(compliance)──▶ approved   (rating → high)
 ▲                                  │
 └──────────reject(compliance)──────┘            (no rating change; re-escalatable)

open ──dismiss(analyst)──▶ dismissed             (terminal; no rating change)
```

- `open` — no open decision (initial, or after a reject).
- `pending_approval` — analyst escalated, awaiting compliance.
- `approved` — compliance approved; the `outcome` (rating → `high`) is written at
  this checkpoint, not before.
- `rejected` — transient signal that resolves back to `open` (the analyst may
  re-escalate); surfaced from the latest `human_action`.
- `dismissed` — analyst closed with no escalation.

## 3. Audit model — `packages/core/src/schemas/audit.ts`

Extend `HumanActionSchema`:

```ts
export const HumanActionSchema = z.object({
  ...auditBase,
  kind: z.literal("human_action"),
  /** Who acted (e.g. "j.weber@amina"). Renamed from `analyst`. */
  actor: z.string().min(1),
  /** Which line-of-defence role acted — drives separation of duties. */
  role: z.enum(["analyst", "compliance_officer"]),
  decision: z.enum(["escalate", "dismiss", "approve", "reject"]),
  rationale: z.string().min(1),
  alertId: z.string().optional(),
});
```

Add a **pure, unit-testable** state deriver in core (new
`packages/core/src/governance/caseState.ts`, exported via a `governance` barrel):

```ts
export type CaseStatus = "open" | "pending_approval" | "approved" | "dismissed";
// Note: a reject resolves back to `open`; the "returned by compliance" message is
// surfaced via `last.decision === "reject"`, not a separate resting status.

export interface CaseState {
  status: CaseStatus;
  /** The last human_action that determined the status, if any. */
  last?: { actor: string; role: string; decision: string; rationale: string; ts: string };
}

/** Replay an entity's audit entries into its current governance state. */
export function deriveCaseState(entries: AuditEntry[]): CaseState;
```

`deriveCaseState` scans the entity's `human_action` entries in order and returns
the resulting status (escalate → pending_approval; approve → approved; reject →
open with `last.decision="reject"`; dismiss → dismissed; none → open).

**Runtime log reset:** `data/audit.jsonl` is gitignored runtime state holding two
old-shape (`analyst`) entries. Rather than migrate, the file is deleted as part
of this change; it rebuilds on use. (No committed data changes.)

## 4. Server — `apps/web/src/lib/server/audit.ts` + `+page.server.ts`

`audit.ts`: add `caseStateFor(entityId): CaseState` = `deriveCaseState(readLines parsed, filtered to entityId)`. Export it; `load` returns a `cases: Record<entityId, CaseState>` map alongside `ratings`.

`+page.server.ts` actions:

- **`decide`** (maker): reads `role`, `decision` (`escalate`|`dismiss`),
  `rationale`, `actor`. Guard: `role` must be `analyst` → else `fail(403)`. Writes
  one `human_action`. **No `outcome`** (escalate just moves to pending). Returns
  the new `CaseState`.
- **`review`** (checker, new): reads `role`, `decision` (`approve`|`reject`),
  `rationale`, `actor`. Guards: `role` must be `compliance_officer`, and
  `caseStateFor(entityId).status === "pending_approval"` → else `fail(403)`.
  Writes `human_action(approve|reject)`; on `approve` also writes the
  `outcome(rating → high, status alert)` checkpoint. Returns the new `CaseState`
  and rating.

`actor` is derived from role for the demo (`"analyst@amina"` /
`"mlro@amina"`) so the maker and checker identities differ in the log.

## 5. UI

**`TopBar.svelte`** — a role switch (shadcn `ToggleGroup` or two `Button`s):
Analyst ⇄ Compliance Officer, bound to the role store. Label shows the active
persona.

**`PatternRail.svelte`** — replace the always-on escalate/dismiss block with a
state- and role-aware control, driven by the entity's `CaseState` (passed from
the page). Each form posts the active `role` (hidden field):
- `open` + analyst → **Escalate** / **Dismiss** (`?/decide`), with a rationale input.
- `open` + compliance → read-only "Awaiting analyst review".
- `pending_approval` → amber "Pending compliance approval" banner.
  - compliance role → **Approve & re-KYC** / **Reject** (`?/review`) + rationale.
  - analyst role → disabled "Awaiting compliance (you raised this)" — **cannot
    self-approve** (visible separation of duties).
- `approved` → "Approved · rating → High by {actor}".
- `rejected` (status back to open, last decision reject) → "Returned by
  compliance: {rationale}" + analyst may re-escalate.
- `dismissed` → "Dismissed by {actor}".

A small **Maker ▸ Checker** two-step indicator shows which checkpoint the case is
at.

**`AuditDrawer.svelte`** — update the `human_action` summary to include role and
the new decisions, e.g. `approve · compliance_officer · mlro@amina · {rationale}`.

**`+page.svelte`** — extend the `enhance` handlers to keep the returned
`CaseState` in local state (mirrors the existing `decided`/`rating` handling) and
pass `case`/`role` down to `PatternRail`.

## 6. Testing

- **Core** (`governance/caseState.test.ts`): `deriveCaseState` over crafted
  entry sequences — empty → open; escalate → pending_approval; escalate+approve →
  approved; escalate+reject → open (last.decision reject); dismiss → dismissed;
  escalate+reject+escalate → pending_approval again.
- **Core** (`schemas/audit.test.ts` — create): `HumanActionSchema` parses the new
  shape (role + approve/reject); rejects an unknown decision.
- **Server** (Vitest, `+page.server` action units or a thin wrapper test): the
  separation-of-duties guard — an `analyst` calling `review`/approve is rejected;
  `approve` from a non-`pending_approval` state is rejected; a full
  escalate→approve writes exactly one `outcome`.

## Why this scores

- **Compliance & Safety (20%)**: real separation of duties + approval checkpoint,
  every step in the immutable hash-chained log → auditable, explainable.
- Reuses the append-only log as the single source of truth (no new infra), so it
  stays consistent with the existing architecture.
