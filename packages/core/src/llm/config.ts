import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * LLM tier configuration. Framework-agnostic — the caller (SvelteKit route or
 * offline script) injects the apiKey and any overrides, never reading the env
 * here (SvelteKit needs $env/dynamic/private, scripts use process.env).
 *
 * Defaults run on Apertus — Switzerland's fully-open sovereign LLM (EPFL / ETH
 * Zurich / CSCS) — served over Public AI's OpenAI-compatible endpoint: the
 * cheaper Apertus-8B reasons per-axis (Stage 2), the stronger Apertus-70B
 * synthesizes the final alert (Stage 3). Swiss-hosted + open-weight reasoning is
 * a real data-residency / auditability story for the AMINA KYC use case.
 *
 * Everything here is overridable per-call via LLMConfig (baseURL / per-stage
 * model), so the same code points at any OpenAI-compatible provider — e.g. set
 * LLM_BASE_URL + LLM_STAGE{2,3}_MODEL in .env to run OpenAI instead. Model ids
 * are lowercase on Public AI. See docs/reference/techstack.md.
 */

/** Default inference endpoint — Public AI, OpenAI-compatible, serves Apertus. */
export const DEFAULT_BASE_URL = "https://api.publicai.co/v1";

/** Stage 2 — per-axis materiality reasoning (cheap tier). */
export const STAGE2_MODEL = "swiss-ai/apertus-8b-instruct";

/** Stage 3 — deep synthesis + recommended action (strong tier). */
export const STAGE3_MODEL = "swiss-ai/apertus-70b-instruct";

export interface LLMConfig {
  apiKey: string;
  /** Override the inference endpoint (default: Public AI / Apertus). */
  baseURL?: string;
  /** Override the Stage 2 model id (default: Apertus-8B). */
  stage2Model?: string;
  /** Override the Stage 3 model id (default: Apertus-70B). */
  stage3Model?: string;
}

/** The model id for a stage, honouring any per-stage override. */
export function stageModel(config: LLMConfig, stage: 2 | 3): string {
  return stage === 2
    ? (config.stage2Model ?? STAGE2_MODEL)
    : (config.stage3Model ?? STAGE3_MODEL);
}

/** Resolve an AI SDK language model bound to the caller-supplied key + endpoint. */
export function languageModel(config: LLMConfig, model: string): LanguageModel {
  const provider = createOpenAICompatible({
    name: "llm",
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    apiKey: config.apiKey,
    // Apertus/OpenAI both honour response_format: json_schema. Without this the
    // AI SDK falls back to prompt-only JSON, which Apertus doesn't emit
    // schema-cleanly → AI_NoObjectGeneratedError. See stage2/stage3.
    supportsStructuredOutputs: true,
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
  "swiss-ai/apertus-8b-instruct": { input: 0, output: 0 },
  "swiss-ai/apertus-70b-instruct": { input: 0, output: 0 },
};

/** USD cost of a call. Unknown models are treated as free (Apertus is free). */
export function costUsd(model: string, usage: LLMUsage): number {
  const p = PRICING[model] ?? { input: 0, output: 0 };
  return (
    (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000
  );
}
