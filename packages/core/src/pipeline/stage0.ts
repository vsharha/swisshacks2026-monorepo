import type { DriftAxis } from "../schemas/index.ts";

/**
 * Stage 0 — deterministic, ~free axis routing.
 *
 * Maps a news headline/body to the drift axis it most plausibly bears on,
 * using keyword rules only (no model call). This is a first-pass router, not
 * a verdict: the LLM tiers (Stage 2) reason about materiality later. Rules are
 * tried in priority order so structural changes (identity, control, scale,
 * domicile) outrank generic adverse-media before falling back to reputation.
 *
 * Provisional and expected to move into a richer stage0 filter as the pipeline
 * grows — see AGENTS.md on this being an evolving prototype.
 *
 * Multilingual (proposal 11): once RSS brings in non-English entries, a few
 * high-signal DE/FR/ES tokens are folded into each rule so common structural
 * events route correctly without a model. These are non-English-only terms, so
 * they never change English routing; deeper multilingual coverage is the NER /
 * embedding stage (proposal 8).
 */

interface AxisRule {
  axis: DriftAxis;
  type: string;
  pattern: RegExp;
}

const RULES: readonly AxisRule[] = [
  {
    axis: "business_model",
    type: "business_model_change",
    pattern:
      /(?<![\p{L}\p{N}])(rebrand|renam(?:e|ed|ing)|pivot|repositions?|business model|now offers?|transition(?:s|ed|ing)? (?:to|into)|shift(?:s|ed|ing)? (?:to|into)|GPU|artificial intelligence|A\.?I\.?|blockchain|crypto|Umfirmierung|Umbenennung|changement de nom)(?![\p{L}\p{N}])/iu,
  },
  {
    axis: "ownership",
    type: "control_change",
    pattern:
      /(?<![\p{L}\p{N}])(CEO|chief executive|appoint(?:s|ed|ment)?|new owner|beneficial owner|stake|board of directors|takeover|acquir(?:e|ed|es|ing|sition)|merger|controlling interest|Übernahme|Beteiligung|rachat|adquisición)(?![\p{L}\p{N}])/iu,
  },
  {
    axis: "scale",
    type: "scale_change",
    pattern:
      /(?<![\p{L}\p{N}])(financing|convertible|raise[sd]?|funding|capital|revenue|valuation|reverse split|stock split|market cap|\$\s?\d|million|billion|Kapitalerhöhung|Finanzierung|levée de fonds)(?![\p{L}\p{N}])/iu,
  },
  {
    axis: "jurisdiction",
    type: "jurisdiction_change",
    pattern:
      /(?<![\p{L}\p{N}])(headquarter|relocat(?:e|ed|ion)|domicil(?:e|ed)|offshore|reincorporat|incorporat(?:e|ed) in|moves? to|registered in|Sitzverlegung|délocalisation)(?![\p{L}\p{N}])/iu,
  },
  {
    axis: "reputation",
    type: "adverse_media",
    pattern:
      /(?<![\p{L}\p{N}])(SEC|lawsuit|sue[sd]?|fraud|investigation|probe|charged|indict|delist|sanction|settlement|misconduct|allegation|Insolvenz|Betrug|Geldwäsche|faillite|blanchiment)(?![\p{L}\p{N}])/iu,
  },
];

export interface AxisClassification {
  axis: DriftAxis;
  type: string;
  confidence: number;
}

/**
 * Classify free text to a drift axis. Returns the first rule that matches in
 * priority order; if nothing matches, defaults to the reputation axis with low
 * confidence (generic news is a weak adverse-media signal until proven otherwise).
 */
export function classifyAxis(text: string): AxisClassification {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { axis: rule.axis, type: rule.type, confidence: 0.6 };
    }
  }
  return { axis: "reputation", type: "adverse_media", confidence: 0.35 };
}
