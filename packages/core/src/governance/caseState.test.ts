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
  it("lets an analyst dismiss an open case", () => {
    expect(governanceCheck("analyst", "dismiss", "open").ok).toBe(true);
  });
  it("blocks any analyst action on a dismissed (terminal) case", () => {
    expect(governanceCheck("analyst", "dismiss", "dismissed").ok).toBe(false);
    expect(governanceCheck("analyst", "escalate", "dismissed").ok).toBe(false);
  });
  it("lets compliance reject a pending case", () => {
    expect(governanceCheck("compliance_officer", "reject", "pending_approval").ok).toBe(true);
  });
});
