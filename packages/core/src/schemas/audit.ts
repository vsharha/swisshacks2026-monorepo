import { z } from "zod";
import {
  Confidence,
  DriftAxisSchema,
  PipelineStageSchema,
  RiskRatingSchema,
  RiskStatusSchema,
  Score,
  Timestamp,
} from "./common.ts";

/** Per-stage token + dollar accounting (the cost story, as a record). */
export const TokenCostSchema = z.object({
  stage: PipelineStageSchema,
  model: z.string().optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  usd: z.number().nonnegative().default(0),
});
export type TokenCost = z.infer<typeof TokenCostSchema>;

/** Fields common to every append-only entry. */
const auditBase = {
  id: z.string().min(1),
  ts: Timestamp,
  entityId: z.string().min(1),
  /** Optional hash-chain for tamper-evidence. */
  prevHash: z.string().optional(),
  hash: z.string().optional(),
};

/** A public signal was ingested — records provenance. */
export const SignalIngestedSchema = z.object({
  ...auditBase,
  kind: z.literal("signal_ingested"),
  signalId: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: z.url(),
});

/** An axis (or the composite) was evaluated — records tier, confidence, cost. */
export const DriftEvaluatedSchema = z.object({
  ...auditBase,
  kind: z.literal("drift_evaluated"),
  axis: DriftAxisSchema.optional(), // omitted for composite-level evaluation
  tier: PipelineStageSchema,
  score: Score,
  confidence: Confidence,
  cost: TokenCostSchema.optional(),
});

/** Whether Stage 3 fired — and crucially, why it did or did not. */
export const EscalationDecisionSchema = z.object({
  ...auditBase,
  kind: z.literal("escalation_decision"),
  composite: Score,
  escalated: z.boolean(),
  reason: z.string().min(1),
});

/** An alert was raised — reasoning, citations, model version live on the Alert. */
export const AlertRaisedSchema = z.object({
  ...auditBase,
  kind: z.literal("alert_raised"),
  alertId: z.string().min(1),
  modelVersion: z.string().min(1),
});

/** A human acted at the HITL gate. */
export const HumanActionSchema = z.object({
  ...auditBase,
  kind: z.literal("human_action"),
  analyst: z.string().min(1),
  decision: z.enum(["escalate", "dismiss"]),
  rationale: z.string().min(1),
  alertId: z.string().optional(),
});

/** The resulting risk-rating change (the outcome of the loop). */
export const OutcomeSchema = z.object({
  ...auditBase,
  kind: z.literal("outcome"),
  fromRating: RiskRatingSchema,
  toRating: RiskRatingSchema,
  newStatus: RiskStatusSchema.optional(),
});

/**
 * The append-only audit log: the regulatory record of the drift-detection →
 * human-decision loop, which doubles as documentation of the cost decisions.
 */
export const AuditEntrySchema = z.discriminatedUnion("kind", [
  SignalIngestedSchema,
  DriftEvaluatedSchema,
  EscalationDecisionSchema,
  AlertRaisedSchema,
  HumanActionSchema,
  OutcomeSchema,
]);
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type AuditEntryKind = AuditEntry["kind"];
