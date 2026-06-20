import { describe, expect, it } from "vitest";
import { classifyAxis } from "./stage0.ts";

describe("classifyAxis", () => {
  it("routes English structural events to the right axis", () => {
    expect(classifyAxis("Company announces rebrand to AI venture").axis).toBe("business_model");
    expect(classifyAxis("Board approves takeover of rival").axis).toBe("ownership");
    expect(classifyAxis("Firm closes $50 million financing round").axis).toBe("scale");
    expect(classifyAxis("Group relocates headquarters offshore").axis).toBe("jurisdiction");
    expect(classifyAxis("Regulator opens fraud investigation").axis).toBe("reputation");
  });

  it("falls back to low-confidence reputation for generic text", () => {
    const c = classifyAxis("the weather was pleasant today");
    expect(c.axis).toBe("reputation");
    expect(c.confidence).toBeLessThan(0.4);
  });

  it("routes common non-English structural terms (proposal 11)", () => {
    expect(classifyAxis("Übernahme durch Investor angekündigt").axis).toBe("ownership");
    expect(classifyAxis("Kapitalerhöhung über 50 Millionen").axis).toBe("scale");
    expect(classifyAxis("Ermittlungen wegen Geldwäsche und Betrug").axis).toBe("reputation");
    expect(classifyAxis("rachat de la société par un fonds").axis).toBe("ownership");
  });
});
