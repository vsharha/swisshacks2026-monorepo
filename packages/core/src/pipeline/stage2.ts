import { z } from "zod";
import { generateObject } from "ai";
import {
  Confidence,
  Score,
  type AxisDrift,
  type DriftAxis,
  type KYCBaseline,
  type Signal,
} from "../schemas/index.ts";
import { anthropicProvider, STAGE2_MODEL, type LLMConfig } from "../llm/config.ts";

/**
 * Stage 2 — per-drifting-axis LLM reasoning about *materiality*. Only fires on
 * the axis that moved, for the entity that moved (the escalation logic IS the
 * cost story). The cheap deterministic tiers produce a first-pass score; this
 * tier decides whether the change actually invalidates the KYC baseline.
 *
 * Output is validated by Zod — a real, demonstrable hallucination check.
 */

export const AxisMaterialitySchema = z.object({
  /** Refined drift score for this axis after reasoning, [0, 1]. */
  score: Score,
  /** How confident the model is in this verdict, [0, 1]. */
  confidence: Confidence,
  verdict: z.enum(["material", "immaterial", "uncertain"]),
  /** One or two sentences on why the drift is (or isn't) material. */
  reasoning: z.string().min(1),
});
export type AxisMateriality = z.infer<typeof AxisMaterialitySchema>;

const AXIS_FOCUS: Record<DriftAxis, string> = {
  business_model: "what the company actually does vs. its onboarded business model",
  ownership: "who owns or controls it vs. the onboarded beneficial owners",
  jurisdiction: "where it is domiciled/operates vs. its onboarded jurisdiction",
  scale: "its size, funding, and activity tempo vs. onboarding",
  reputation: "adverse media and how it is perceived",
};

export interface ReasonAxisParams {
  config: LLMConfig;
  baseline: KYCBaseline;
  axis: DriftAxis;
  /** Signals attributed to this axis, up to the current clock. */
  signals: Signal[];
  /** The cheap-tier verdict being escalated. */
  prior: AxisDrift;
}

function renderSignals(signals: Signal[]): string {
  return signals
    .slice(0, 20)
    .map(
      (s) =>
        `- [${s.date.slice(0, 10)}] (${s.source}, conf ${s.confidence.toFixed(2)}) ${s.title}`,
    )
    .join("\n");
}

/** Reason about the materiality of drift on a single axis. */
export async function reasonAxisMateriality(
  params: ReasonAxisParams,
): Promise<AxisMateriality> {
  const { config, baseline, axis, signals, prior } = params;
  const provider = anthropicProvider(config);

  const { object } = await generateObject({
    model: provider(config.stage2Model ?? STAGE2_MODEL),
    schema: AxisMaterialitySchema,
    system:
      "You are a KYC analyst assessing whether a customer's risk profile has structurally drifted on ONE axis. " +
      "Be precise and conservative: only call drift 'material' when the evidence genuinely invalidates the onboarding assumptions. " +
      "Ground every judgement in the supplied signals; do not invent facts.",
    prompt:
      `Customer: ${baseline.name} (${baseline.jurisdiction}), onboarded as ${baseline.riskRating} risk.\n` +
      `Onboarding business model: ${baseline.businessModel}\n\n` +
      `Axis under review: ${axis} — ${AXIS_FOCUS[axis]}.\n` +
      `Cheap-tier first-pass score: ${prior.score.toFixed(2)} (${prior.status}).\n\n` +
      `Signals on this axis up to now:\n${renderSignals(signals) || "(none)"}\n\n` +
      `Assess the materiality of drift on this axis. Return a refined score, confidence, a verdict, and concise reasoning.`,
  });

  return object;
}
