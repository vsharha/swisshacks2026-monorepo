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
