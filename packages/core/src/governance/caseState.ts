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
    if (status !== "open") return { ok: false, reason: `Case is ${status}; no analyst action available.` };
    return { ok: true };
  }
  // approve / reject
  if (role !== "compliance_officer")
    return { ok: false, reason: "Only a compliance officer may approve or reject." };
  if (status !== "pending_approval")
    return { ok: false, reason: "No pending approval to act on." };
  return { ok: true };
}
