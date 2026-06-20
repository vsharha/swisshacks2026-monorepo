import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * LLM tier configuration. Framework-agnostic — the apiKey is injected by the
 * caller (SvelteKit route or offline script), never read from process.env here.
 *
 * Reasoning runs on Apertus — Switzerland's fully-open sovereign LLM (EPFL /
 * ETH Zurich / CSCS) — served over Public AI's OpenAI-compatible endpoint.
 * Swiss-hosted + open-weight reasoning is a real data-residency / auditability
 * story for the AMINA KYC use case (and free during the hackathon → $0 marginal).
 *
 * Model tiering IS the cost story: a cheaper model reasons per-axis (Stage 2),
 * a stronger model synthesizes the final alert (Stage 3). Public AI currently
 * serves Apertus-70B only, so both tiers default to it; override stage2Model
 * once an 8B endpoint is available for a true cheap/expensive split. See
 * docs/reference/techstack.md.
 */

/** Public AI inference utility — OpenAI-compatible base URL. */
export const PUBLICAI_BASE_URL = "https://api.publicai.co/v1";

/** Stage 2 — per-axis materiality reasoning. Confirm the exact id in your Public AI dashboard. */
export const STAGE2_MODEL = "swiss-ai/Apertus-70B-Instruct";

/** Stage 3 — deep synthesis + recommended action. */
export const STAGE3_MODEL = "swiss-ai/Apertus-70B-Instruct";

export interface LLMConfig {
  apiKey: string;
  /** Override the Public AI base URL (e.g. a self-hosted Apertus endpoint). */
  baseURL?: string;
  stage2Model?: string;
  stage3Model?: string;
}

/** The model id for a stage, honouring per-stage overrides then defaults. */
export function stageModel(config: LLMConfig, stage: 2 | 3): string {
  if (stage === 2) return config.stage2Model ?? STAGE2_MODEL;
  return config.stage3Model ?? STAGE3_MODEL;
}

/** Resolve an AI SDK language model bound to the caller-supplied Public AI key. */
export function languageModel(config: LLMConfig, model: string): LanguageModel {
  const provider = createOpenAICompatible({
    name: "publicai",
    baseURL: config.baseURL ?? PUBLICAI_BASE_URL,
    apiKey: config.apiKey,
  });
  return provider(model);
}

/** Token usage from one LLM call. */
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Per-model price in USD per million tokens (input / output). */
const PRICING: Record<string, { input: number; output: number }> = {
  // Apertus via Public AI is free during the hackathon → $0 marginal cost. This
  // strengthens the funnel (Swiss open model, zero unit cost vs the naive
  // baseline); swap to representative self-host pricing if you want non-zero $.
  "swiss-ai/Apertus-70B-Instruct": { input: 0, output: 0 },
};

/** USD cost of a call. Unknown models are treated as free (Apertus is free). */
export function costUsd(model: string, usage: LLMUsage): number {
  const p = PRICING[model] ?? { input: 0, output: 0 };
  return (
    (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000
  );
}
