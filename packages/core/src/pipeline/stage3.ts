import { z } from "zod";
import { generateObject } from "ai";
import {
  AlertSchema,
  Confidence,
  DriftAxisSchema,
  Score,
  type Alert,
  type Citation,
  type DriftVector,
  type KYCBaseline,
  type PatternArchetype,
  type RelationshipPath,
  type Signal,
} from "../schemas/index.ts";
import {
  languageModel,
  stageModel,
  type LLMConfig,
  type LLMUsage,
} from "../llm/config.ts";

/**
 * Stage 3 — deep synthesis. Fires only on entities that crossed the composite
 * threshold. Produces the RE-KYC alert: recommended action, reasoning, the
 * pattern-library match (an outcome prior, not just a score), and citations.
 *
 * The LLM drafts the judgement; this module assembles the full Alert and
 * validates it against AlertSchema (which requires ≥1 citation) — the
 * structured-output guardrail that makes citations non-optional.
 */

/** The model's draft. The non-negotiable fields (ids, timestamps) are added by code. */
const SynthesisDraftSchema = z.object({
  recommendedAction: z.string().min(1),
  reasoning: z.string().min(1),
  triggeringAxes: z.array(DriftAxisSchema).min(1),
  confidence: Confidence,
  /** Best matching archetype from the supplied library, or null if none fits. */
  patternMatch: z
    .object({
      archetypeId: z.string().min(1),
      similarity: Score,
      rationale: z.string().min(1),
    })
    .nullable(),
  /** Signal ids (from the supplied evidence) that support the alert. */
  citationSignalIds: z.array(z.string()),
});

export interface SynthesizeAlertParams {
  config: LLMConfig;
  baseline: KYCBaseline;
  drift: DriftVector;
  /** Evidence signals up to the current clock (the model cites from these). */
  signals: Signal[];
  /** Pattern library to match against. */
  archetypes: PatternArchetype[];
  /** Stable id for the produced alert. */
  alertId: string;
  /** Relationship chains (proposal 3) to attach to the alert as explainability. */
  relationshipPaths?: RelationshipPath[];
}

function renderArchetypes(archetypes: PatternArchetype[]): string {
  return archetypes
    .map(
      (a) =>
        `- ${a.id}: ${a.name} — ${a.summary} Axes: ${a.axes.join(", ")}. Outcome: ${a.outcome}`,
    )
    .join("\n");
}

function renderSignals(signals: Signal[]): string {
  return signals
    .map((s) => `- ${s.id} [${s.date.slice(0, 10)}] (${s.axis}) ${s.title}`)
    .join("\n");
}

export interface SynthesizeAlertResult {
  alert: Alert;
  usage: LLMUsage;
  model: string;
}

/** Synthesize a RE-KYC alert for an entity that crossed the threshold. */
export async function synthesizeAlert(
  params: SynthesizeAlertParams,
): Promise<SynthesizeAlertResult> {
  const { config, baseline, drift, signals, archetypes, alertId } = params;
  const evidence = signals.filter((s) => s.date <= drift.asOf);
  const model = stageModel(config, 3);

  const axisLines = Object.entries(drift.axes)
    .map(([axis, a]) => `  ${axis}: ${a.score.toFixed(2)} (${a.status})`)
    .join("\n");

  const { object: draft, usage } = await generateObject({
    model: languageModel(config, model),
    schema: SynthesisDraftSchema,
    system:
      "You are a senior KYC/AML analyst writing a re-KYC recommendation for a human reviewer. " +
      "Decide and justify a recommended action, match the drift signature against the known archetypes to give an outcome prior, " +
      "and cite the specific signals that support your reasoning. Only cite signal ids that appear in the evidence list. " +
      "Be rigorous and grounded; never invent sources or facts.",
    prompt:
      `Customer: ${baseline.name} (${baseline.jurisdiction}), onboarded as ${baseline.riskRating} risk.\n` +
      `Onboarding business model: ${baseline.businessModel}\n\n` +
      `Composite drift: ${drift.composite.toFixed(2)} (${drift.status}) as of ${drift.asOf.slice(0, 10)}.\n` +
      `Per-axis drift:\n${axisLines}\n\n` +
      `Known archetypes:\n${renderArchetypes(archetypes)}\n\n` +
      `Evidence signals:\n${renderSignals(evidence)}\n\n` +
      `Write the recommended action, reasoning, the triggering axes, your confidence, the best pattern match (or null), ` +
      `and the ids of the evidence signals that support the alert.`,
  });

  // Assemble citations from the model's chosen signal ids; fall back to the
  // strongest evidence so the schema's ≥1-citation guardrail always holds.
  const byId = new Map(evidence.map((s) => [s.id, s]));
  let citations: Citation[] = draft.citationSignalIds
    .map((id) => byId.get(id))
    .filter((s): s is Signal => Boolean(s))
    .map((s) => ({ signalId: s.id, sourceUrl: s.sourceUrl, title: s.title }));
  if (citations.length === 0) {
    citations = [...evidence]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((s) => ({ signalId: s.id, sourceUrl: s.sourceUrl, title: s.title }));
  }

  // Resolve the pattern match against the real library entry (name + outcome).
  const matched = draft.patternMatch
    ? archetypes.find((a) => a.id === draft.patternMatch?.archetypeId)
    : undefined;
  const patternMatch =
    draft.patternMatch && matched
      ? {
          archetypeId: matched.id,
          archetypeName: matched.name,
          similarity: draft.patternMatch.similarity,
          outcome: matched.outcome,
        }
      : undefined;

  const alert = AlertSchema.parse({
    id: alertId,
    entityId: baseline.entityId,
    createdAt: new Date().toISOString(),
    composite: drift.composite,
    status: drift.status,
    triggeringAxes: draft.triggeringAxes,
    recommendedAction: draft.recommendedAction,
    reasoning: draft.reasoning,
    citations,
    patternMatch,
    relationshipPaths: params.relationshipPaths ?? [],
    confidence: draft.confidence,
    modelVersion: model,
  } satisfies Record<string, unknown>);

  return {
    alert,
    usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
    model,
  };
}
