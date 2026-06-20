import { describe, expect, it } from "vitest";
import { advanceState, emptyState, filterUnseen, sinceDate } from "./state.ts";
import { SignalSchema, type Signal } from "../schemas/index.ts";

const signal = (id: string, date: string): Signal =>
  SignalSchema.parse({
    id,
    entityId: "e1",
    axis: "reputation",
    type: "adverse_media",
    date,
    sourceUrl: `https://example.com/${id}`,
    title: id,
    source: "rss",
    payload: {},
    confidence: 0.5,
  });

describe("ingest state", () => {
  it("falls back to the default on a cold start", () => {
    expect(sinceDate(emptyState(), "2026-01-01")).toBe("2026-01-01");
  });

  it("advances the watermark to the latest date and records seen ids", () => {
    const s1 = advanceState(emptyState(), [signal("a", "2026-06-01"), signal("b", "2026-06-10")]);
    expect(s1.watermark).toBe("2026-06-10");
    expect(s1.seenIds).toEqual(["a", "b"]);
    expect(sinceDate(s1, "2026-01-01")).toBe("2026-06-10");
  });

  it("filters out already-seen signals on a re-pull", () => {
    const state = advanceState(emptyState(), [signal("a", "2026-06-01")]);
    const fresh = filterUnseen([signal("a", "2026-06-01"), signal("c", "2026-06-12")], state);
    expect(fresh.map((s) => s.id)).toEqual(["c"]);
  });
});
