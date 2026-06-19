import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * LLM tier configuration. Framework-agnostic — the apiKey is injected by the
 * caller (SvelteKit route or offline script), never read from process.env here.
 *
 * Model tiering IS the cost story: cheaper models reason per-axis (Stage 2),
 * the stronger model only synthesizes the final alert (Stage 3). See
 * docs/reference/techstack.md.
 */

/** Stage 2 — per-axis materiality reasoning. Cheap/mid tier. */
export const STAGE2_MODEL = "claude-haiku-4-5";

/** Stage 3 — deep synthesis + recommended action. Expensive tier. */
export const STAGE3_MODEL = "claude-sonnet-4-6";

export interface LLMConfig {
  apiKey: string;
  stage2Model?: string;
  stage3Model?: string;
}

/** Build an Anthropic provider bound to the caller-supplied key. */
export function anthropicProvider(config: LLMConfig) {
  return createAnthropic({ apiKey: config.apiKey });
}
