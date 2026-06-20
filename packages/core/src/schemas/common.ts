import { z } from "zod";

/**
 * The 5-axis drift model. A customer's KYC baseline is decomposed into these
 * axes; each is scored independently and combined into a composite. See
 * docs/reference/product.md "The drift model".
 */
export const DriftAxisSchema = z.enum([
  "business_model", // what the company actually does
  "ownership", // who owns / controls it
  "jurisdiction", // where it is domiciled / operates
  "scale", // size, volume, funding, tempo
  "reputation", // how it is perceived (adverse media)
]);
export type DriftAxis = z.infer<typeof DriftAxisSchema>;

/** Canonical axis order — use for the radar and any stable rendering. */
export const AXES = DriftAxisSchema.options;

/** Signal-channel status: the only saturated colours in the UI. */
export const RiskStatusSchema = z.enum(["stable", "watch", "alert"]);
export type RiskStatus = z.infer<typeof RiskStatusSchema>;

/** Onboarding / current KYC risk rating. */
export const RiskRatingSchema = z.enum(["low", "medium", "high"]);
export type RiskRating = z.infer<typeof RiskRatingSchema>;

/** Line-of-defence role that performed a human action (governance). */
export const HumanRoleSchema = z.enum(["analyst", "compliance_officer"]);
export type HumanRole = z.infer<typeof HumanRoleSchema>;

/** The human decisions in the maker-checker workflow. */
export const HumanDecisionSchema = z.enum(["escalate", "dismiss", "approve", "reject"]);
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;

/** Tiered cascade stage that did the work. See docs/reference/techstack.md. */
export const PipelineStageSchema = z.enum(["stage0", "stage1", "stage2", "stage3"]);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

/** Provenance: which connector produced a signal. */
export const SourceSchema = z.enum([
  "eventregistry",
  "rss",
  "sec_edgar",
  "wayback",
  "opensanctions",
  "gleif",
  "regulator",
  "opencorporates",
  "graph",
  "market",
  "chain",
  "internal",
  "manual",
]);
export type Source = z.infer<typeof SourceSchema>;

/** Confidence and score are both normalised to [0, 1]. */
export const Confidence = z.number().min(0).max(1);
export const Score = z.number().min(0).max(1);

/**
 * A [0, 1] value tolerant of LLM outputs that overshoot the range. Open-weight
 * models (Apertus) honour a json_schema's *shape* but not its numeric bounds,
 * so a Stage 2/3 model occasionally returns e.g. 1.1 — clamp rather than hard-
 * fail the whole escalation. Deterministic tiers use the strict Score/Confidence.
 */
export const ClampedUnit = z.number().transform((n) => Math.max(0, Math.min(1, n)));

/** An observation date: ISO date (YYYY-MM-DD) or a full ISO datetime. */
export const EventDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

/** A precise system timestamp (audit/log entries): full ISO datetime. */
export const Timestamp = z.iso.datetime({ offset: true });
