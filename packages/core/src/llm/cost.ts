/**
 * LLM cost model — pure, dependency-free. Kept separate from `config.ts` (which
 * pulls in the AI SDK provider factory) so cost-only consumers — e.g. the
 * SvelteKit app replaying captured verdicts — can import it without dragging the
 * SDK (and any live-API surface) into their bundle.
 */

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
