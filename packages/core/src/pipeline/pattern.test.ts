import { describe, expect, it } from "vitest";
import type { PatternArchetype, PatternMatch } from "../schemas/index.ts";
import { selectPatternMatch } from "./pattern.ts";

const longBlockchain: PatternArchetype = {
  id: "long-blockchain-2017",
  name: "Long Blockchain Corp (2017)",
  period: "2017-2018",
  summary: "Buzzword rename with thin substance.",
  axes: ["business_model", "scale", "reputation"],
  arc: [],
  outcome: "Adverse regulatory action.",
  keywords: ["blockchain"],
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
  keywords: ["blockchain"],
  citations: [],
};

describe("selectPatternMatch", () => {
  it("prefers the captured Stage 3 pattern over the axis-overlap fallback", () => {
    const captured: PatternMatch = {
      archetypeId: "long-blockchain-2017",
      archetypeName: "Long Blockchain Corp (2017)",
      similarity: 0.93,
      outcome: "Adverse regulatory action.",
    };

    const match = selectPatternMatch(
      [longBlockchain, overstock],
      ["business_model", "ownership", "scale"],
      captured,
    );

    expect(match?.archetype.id).toBe("long-blockchain-2017");
    expect(match?.similarity).toBe(0.93);
    expect(match?.source).toBe("stage3");
  });

  it("falls back to the closest axis-overlap pattern without a captured match", () => {
    const match = selectPatternMatch(
      [longBlockchain, overstock],
      ["business_model", "ownership", "scale"],
    );

    expect(match?.archetype.id).toBe("overstock-blockchain-2018");
    expect(match?.similarity).toBe(1);
    expect(match?.source).toBe("axis");
  });
});
