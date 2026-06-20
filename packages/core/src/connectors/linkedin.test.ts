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
    ) as [ReturnType<typeof hiringEventToSignals>[0]];
    expect(s.axis).toBe("business_model");
    expect(s.type).toBe("hiring_pivot");
    expect(s.source).toBe("linkedin");
    expect(s.payload.focus).toBe("digital asset custody & AML");
    expect(s.confidence).toBe(0.6);
    expect(() => SignalSchema.parse(s)).not.toThrow();
  });
  it("routes surge / freeze / drop to the scale axis at 0.72", () => {
    for (const kind of ["hiring_surge", "hiring_freeze", "headcount_drop"] as const) {
      const s = hiringEventToSignals(HiringEventSchema.parse({ ...base, kind }))[0]!;
      expect(s.axis).toBe("scale");
      expect(s.confidence).toBe(0.72);
    }
  });
  it("carries headcount / changePct / openRoles into payload (null when absent)", () => {
    const [s] = hiringEventToSignals(
      HiringEventSchema.parse({ ...base, kind: "hiring_surge", headcount: 320, changePct: 45, openRoles: 60 }),
    ) as [ReturnType<typeof hiringEventToSignals>[0]];
    expect(s.payload).toMatchObject({ headcount: 320, changePct: 45, openRoles: 60, focus: null });
  });
});
