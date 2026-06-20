import { describe, expect, it } from "vitest";
import { marketEventToSignals, MarketEventSchema } from "./market.ts";

describe("marketEventToSignals", () => {
  it("maps a funding round to a scale signal", () => {
    const event = MarketEventSchema.parse({
      entityId: "strategy",
      kind: "funding_round",
      amountUsd: 500_000_000,
      date: "2026-04-15",
      sourceUrl: "https://market.example/strategy-notes",
      title: "$500M convertible notes priced.",
    });
    const [s] = marketEventToSignals(event);
    expect(s!.axis).toBe("scale");
    expect(s!.type).toBe("funding_round");
    expect(s!.source).toBe("market");
    expect(s!.payload.amountUsd).toBe(500_000_000);
  });
});
