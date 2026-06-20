import { describe, expect, it } from "vitest";
import {
  internalRecordsToOutcomes,
  internalRecordsToSignals,
  InternalRecordSchema,
} from "./internal.ts";
import { confidenceForAxis, historicalAccuracyFromOutcomes } from "../drift/confidence.ts";
import { SignalSchema, type Signal } from "../schemas/index.ts";

const records = [
  InternalRecordSchema.parse({
    entityId: "gulf-bridge-capital",
    kind: "investigation",
    date: "2024-11-02",
    summary: "Prior EDD review on offshore investor structure.",
    sourceUrl: "https://internal.amina.example/cases/2024-1180",
    outcome: { fromRating: "medium", toRating: "high" },
  }),
  InternalRecordSchema.parse({
    entityId: "gulf-bridge-capital",
    kind: "profile_change",
    date: "2025-02-10",
    summary: "Beneficial-owner update filed.",
    sourceUrl: "https://internal.amina.example/cases/2025-0042",
  }),
];

describe("internalRecordsToSignals", () => {
  it("routes records to reputation/ownership with the internal source", () => {
    const signals = internalRecordsToSignals(records);
    expect(signals).toHaveLength(2);
    expect(signals[0]!.axis).toBe("reputation"); // investigation
    expect(signals[1]!.axis).toBe("ownership"); // profile_change
    expect(signals.every((s) => s.source === "internal")).toBe(true);
    expect(signals.every((s) => s.confidence >= 0.9)).toBe(true);
  });
});

describe("internalRecordsToOutcomes", () => {
  it("emits an Outcome audit entry only for records that closed a review", () => {
    const outcomes = internalRecordsToOutcomes(records);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.kind).toBe("outcome");
    expect(outcomes[0]!.ts).toBe("2024-11-02T00:00:00Z");
  });
});

describe("confidence engine fourth term (proposal 13)", () => {
  it("uses the supplied historical accuracy instead of the source-quality stub", () => {
    const sig: Signal[] = [
      SignalSchema.parse({
        id: "s",
        entityId: "e",
        axis: "reputation",
        type: "adverse_media",
        date: "2026-06-20",
        sourceUrl: "https://example.com/x",
        title: "t",
        source: "rss",
        payload: {},
        confidence: 0.5,
      }),
    ];
    const stub = confidenceForAxis(sig, "2026-06-20");
    const withTrackRecord = confidenceForAxis(sig, "2026-06-20", 1);
    // A perfect track record lifts confidence above the source-quality stub.
    expect(withTrackRecord).toBeGreaterThan(stub);
  });

  it("returns a cautious prior when there is no track record", () => {
    expect(historicalAccuracyFromOutcomes(0, 0)).toBeCloseTo(0.6);
    expect(historicalAccuracyFromOutcomes(3, 4)).toBeCloseTo(0.75);
  });
});
