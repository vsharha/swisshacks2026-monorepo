import { describe, expect, it } from "vitest";
import type { DriftAxis, PatternArchetype, Signal } from "../schemas/index.ts";
import { selectPatternMatch } from "./pattern.ts";

const longBlockchain: PatternArchetype = {
  id: "long-blockchain-2017",
  name: "Long Blockchain Corp (2017)",
  period: "2017-2018",
  summary: "Buzzword rename with thin substance.",
  axes: ["business_model", "scale", "reputation"],
  arc: [],
  outcome: "Adverse regulatory action.",
  keywords: [
    "rename",
    "rebrand",
    "buzzword",
    "blockchain",
    "AI pivot",
    "stock pump",
    "spike",
    "thin substance",
    "struggling brand",
    "delisting",
  ],
  citations: [],
};

const overstock: PatternArchetype = {
  id: "overstock-blockchain-2018",
  name: "Overstock.com crypto-treasury pivot (2018)",
  period: "2017-2020",
  summary: "Operating company over-rotates into crypto strategy.",
  axes: ["business_model", "ownership", "scale"],
  arc: [],
  outcome: "Adverse strategic unwind.",
  keywords: [
    "crypto treasury",
    "digital asset treasury",
    "bitcoin",
    "blockchain pivot",
    "balance-sheet conversion",
    "single-asset",
    "concentration",
    "leverage",
    "convertible debt",
    "NAV premium",
    "founder control",
    "super-voting",
    "controlling shareholder",
    "stock surge",
    "reflexive unwind",
    "security token",
  ],
  citations: [],
};

function signal(axis: DriftAxis, title: string, payload: Record<string, unknown> = {}): Signal {
  return {
    id: title.toLowerCase().replace(/\W+/g, "-"),
    entityId: "entity",
    axis,
    type: `${axis}_change`,
    date: "2026-06-17",
    sourceUrl: "https://example.com/signal",
    title,
    source: "eventregistry",
    payload,
    confidence: 0.9,
  };
}

describe("selectPatternMatch", () => {
  it("can predict a pattern from signal evidence before any drift axis has crossed", () => {
    const match = selectPatternMatch(
      [longBlockchain, overstock],
      [],
      [
        signal(
          "business_model",
          "Allbirds rebrands as Smartbird in AI pivot, triggering a stock pump",
        ),
      ],
    );

    expect(match?.archetype.id).toBe("long-blockchain-2017");
    expect(match?.axes).toEqual(["business_model"]);
    expect(match?.source).toBe("signals");
  });

  it("does not match a pattern from axes alone", () => {
    const match = selectPatternMatch(
      [longBlockchain, overstock],
      ["business_model", "ownership", "scale"],
      [
        signal("business_model", "Allbirds CEO sells shares to cover tax obligations"),
        signal("ownership", "SC 13G beneficial ownership filing"),
        signal("scale", "Sustainable fashion is not a standalone category"),
      ],
    );

    expect(match).toBeUndefined();
  });

  it("matches the buzzword-rename archetype from live signal text", () => {
    const match = selectPatternMatch(
      [longBlockchain, overstock],
      ["business_model", "ownership", "scale"],
      [
        signal(
          "business_model",
          "Allbirds rebrands as Smartbird in AI pivot, sending stock soaring",
        ),
        signal("scale", "Allbirds stock pumps again after sneaker firm completes AI pivot"),
        signal("ownership", "New CEO appointed during Smartbird name change"),
      ],
    );

    expect(match?.archetype.id).toBe("long-blockchain-2017");
    expect(match?.similarity).toBeGreaterThan(0.7);
    expect(match?.source).toBe("signals");
  });

  it("matches the crypto-treasury archetype from live signal text", () => {
    const match = selectPatternMatch(
      [longBlockchain, overstock],
      ["business_model", "ownership", "scale"],
      [
        signal("business_model", "Strategy renews Bitcoin treasury bet"),
        signal("scale", "Preferred stock risks rise as bitcoin buying accelerates"),
        signal("ownership", "Founder control and concentration concerns around crypto strategy"),
      ],
    );

    expect(match?.archetype.id).toBe("overstock-blockchain-2018");
    expect(match?.similarity).toBeGreaterThan(0.7);
    expect(match?.source).toBe("signals");
  });
});
