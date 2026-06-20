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
