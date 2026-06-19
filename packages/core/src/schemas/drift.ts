import { z } from "zod";
import {
  Confidence,
  DriftAxisSchema,
  EventDate,
  PipelineStageSchema,
  RiskStatusSchema,
  Score,
} from "./common.ts";

/** Drift on a single axis: the verdict plus the evidence and how it was reached. */
export const AxisDriftSchema = z.object({
  score: Score,
  confidence: Confidence,
  status: RiskStatusSchema,
  /** Highest tier this axis reached (cost accounting + explainability). */
  tierReached: PipelineStageSchema,
  /** Signal ids that contributed to this axis verdict. */
  signalIds: z.array(z.string()).default([]),
  /** Human-readable per-axis reasoning (populated once the LLM tier fires). */
  reasoning: z.string().optional(),
});
export type AxisDrift = z.infer<typeof AxisDriftSchema>;

/**
 * The drift vector is both the intelligence and the dashboard: a per-axis
 * verdict map plus a weighted composite and overall status. Keyed by axis so
 * every axis must be present (the radar always has 5 spokes).
 */
export const DriftVectorSchema = z.object({
  entityId: z.string().min(1),
  /** The scripted-clock instant this vector reflects. */
  asOf: EventDate,
  axes: z.record(DriftAxisSchema, AxisDriftSchema),
  /** Weighted composite across axes, [0, 1]. */
  composite: Score,
  status: RiskStatusSchema,
});
export type DriftVector = z.infer<typeof DriftVectorSchema>;
