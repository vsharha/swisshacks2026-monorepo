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
