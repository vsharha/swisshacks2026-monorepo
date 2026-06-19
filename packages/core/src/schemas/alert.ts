import { z } from "zod";
import {
  Confidence,
  DriftAxisSchema,
  RiskStatusSchema,
  Score,
  Timestamp,
} from "./common.ts";

/**
 * A match against the pattern library (reasoning by analogy). Lets an alert
 * carry an outcome prior, not just a score — e.g. "matches Long Blockchain
 * Corp (2017), which ended in SEC charges and delisting".
 */
export const PatternMatchSchema = z.object({
  archetypeId: z.string().min(1), // e.g. "long-blockchain-2017"
  archetypeName: z.string().min(1),
  similarity: Score,
  /** Documented base-rate outcome of the archetype. */
  outcome: z.string().min(1),
});
export type PatternMatch = z.infer<typeof PatternMatchSchema>;

/** A single cited claim. Every assertion in an alert traces to a source. */
export const CitationSchema = z.object({
  /** The signal this citation came from, when applicable. */
  signalId: z.string().optional(),
  sourceUrl: z.url(),
  title: z.string().min(1),
  /** Optional supporting excerpt. */
  quote: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

/**
 * Stage 3 deep-synthesis output: the RE-KYC alert. Requires at least one
 * citation by schema — a hallucination guardrail, not a convention.
 */
export const AlertSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().min(1),
  createdAt: Timestamp,
  composite: Score,
  status: RiskStatusSchema,
  /** Axes that drove the escalation. */
  triggeringAxes: z.array(DriftAxisSchema).min(1),
  recommendedAction: z.string().min(1),
  reasoning: z.string().min(1),
  citations: z.array(CitationSchema).min(1),
  patternMatch: PatternMatchSchema.optional(),
  confidence: Confidence,
  /** Model that produced this synthesis (audit trail). */
  modelVersion: z.string().min(1),
});
export type Alert = z.infer<typeof AlertSchema>;
