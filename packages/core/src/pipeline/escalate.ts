import { scoreDriftVector } from "../drift/score.ts";
import {
  AXES,
  RelationshipPathSchema,
  type Alert,
  type AuditEntry,
  type DriftAxis,
  type DriftVector,
  type KYCBaseline,
  type PatternArchetype,
  type RelationshipPath,
  type RiskStatus,
  type Signal,
} from "../schemas/index.ts";
import { costUsd, type LLMConfig, type LLMUsage } from "../llm/config.ts";
import { reasonAxisMateriality, type AxisMateriality } from "./stage2.ts";
import { synthesizeAlert } from "./stage3.ts";

/**
 * The escalation cascade as one function — the single source of truth for the
 * cost story (Stage 2 only on axes that moved; Stage 3 only when the composite
 * crosses the alert threshold). Both callers run this: the live SvelteKit route
 * and the offline `analyze` script. It is side-effect-free — it returns the full
 * structured outcome (drift, per-axis verdicts with usage/model, the alert, and
 * a running cost) and lets each caller apply its own side effects (audit log in
 * the app, console + file in the script).
 */

export interface EscalationCost {
  /** Stage-2 LLM calls made (one per drifting axis). */
  stage2Calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface Stage2Outcome {
  axis: DriftAxis;
  result: AxisMateriality;
  usage: LLMUsage;
  model: string;
}

export interface Stage3Outcome {
  alert: Alert;
  usage: LLMUsage;
  model: string;
}

/** Minimum composite jump since the last evaluation that escalates on its own. */
export const ESCALATION_DELTA = 0.15;

/**
 * Pull the relationship paths carried by graph-derived signals (proposal 3) so
 * Stage 3 can attach them to the alert as citable explainability. Signals
 * without a valid `payload.path` are ignored.
 */
export function relationshipPathsFromSignals(signals: Signal[]): RelationshipPath[] {
  const paths: RelationshipPath[] = [];
  for (const s of signals) {
    const parsed = RelationshipPathSchema.safeParse(s.payload.path);
    if (parsed.success) paths.push(parsed.data);
  }
  return paths;
}

export interface EscalationGate {
  escalated: boolean;
  reason: string;
}

/**
 * Change-triggered escalation (proposal 2): fire Stage 3 on an absolute alert,
 * OR when the composite jumps by `delta` since the prior evaluation even below
 * the absolute threshold. With no `priorComposite` this is byte-for-byte the
 * original level-only gate, so every existing caller is unchanged.
 */
export function escalationGate(
  composite: number,
  status: RiskStatus,
  priorComposite?: number,
  delta = ESCALATION_DELTA,
): EscalationGate {
  if (status === "alert") {
    return { escalated: true, reason: `Composite ${composite.toFixed(2)} crossed the alert threshold.` };
  }
  if (priorComposite !== undefined && composite - priorComposite >= delta) {
    return {
      escalated: true,
      reason: `Composite jumped ${(composite - priorComposite).toFixed(2)} (${priorComposite.toFixed(2)} → ${composite.toFixed(2)}), exceeding the ${delta} delta.`,
    };
  }
  return { escalated: false, reason: `Composite ${composite.toFixed(2)} below the alert threshold.` };
}

/**
 * Most-recent composite-level (`axis` omitted) `drift_evaluated` score for an
 * entity, or undefined if none. The caller owns the audit log and passes the
 * result into `runEscalation` as `priorComposite`, keeping escalation
 * side-effect-free.
 */
export function priorComposite(entries: AuditEntry[], entityId: string): number | undefined {
  let latest: { ts: string; score: number } | undefined;
  for (const e of entries) {
    if (e.kind === "drift_evaluated" && e.entityId === entityId && e.axis === undefined) {
      if (!latest || e.ts > latest.ts) latest = { ts: e.ts, score: e.score };
    }
  }
  return latest?.score;
}

export interface EscalationResult {
  drift: DriftVector;
  /** Axes that left 'stable' and were escalated to Stage 2, in axis order. */
  drifting: DriftAxis[];
  stage2: Stage2Outcome[];
  /** Whether the composite crossed the alert threshold (Stage 3 fired). */
  escalated: boolean;
  /** Present iff escalated. */
  stage3?: Stage3Outcome;
  /** Why Stage 3 did or did not fire (level-cross vs delta-cross). */
  escalationReason: string;
  cost: EscalationCost;
}

export interface RunEscalationParams {
  config: LLMConfig;
  baseline: KYCBaseline;
  signals: Signal[];
  archetypes: PatternArchetype[];
  /** Scripted-clock instant; only signals on or before it count. */
  asOf: string;
  /** Stable id for a produced alert. Defaults to `alert-<entity>-<now>`. */
  alertId?: string;
  /** Prior composite from the last evaluation; enables change-triggered escalation. */
  priorComposite?: number;
}

/**
 * Score drift at `asOf`, reason about each drifting axis (Stage 2), and — only
 * if the composite alerts — synthesize the RE-KYC alert (Stage 3).
 */
export async function runEscalation(params: RunEscalationParams): Promise<EscalationResult> {
  const { config, baseline, signals, archetypes, asOf } = params;

  const drift = scoreDriftVector(baseline, signals, { asOf });
  const evidence = signals.filter((s) => s.date <= asOf);

  const cost: EscalationCost = { stage2Calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
  const tally = (model: string, usage: LLMUsage) => {
    cost.inputTokens += usage.inputTokens;
    cost.outputTokens += usage.outputTokens;
    cost.usd += costUsd(model, usage);
  };

  // Stage 2 — reason only about the axes that moved.
  const drifting = AXES.filter((a) => drift.axes[a].status !== "stable");
  const stage2: Stage2Outcome[] = [];
  for (const axis of drifting) {
    const { result, usage, model } = await reasonAxisMateriality({
      config,
      baseline,
      axis,
      signals: evidence.filter((s) => s.axis === axis),
      prior: drift.axes[axis],
    });
    cost.stage2Calls += 1;
    tally(model, usage);
    stage2.push({ axis, result, usage, model });
  }

  const gate = escalationGate(drift.composite, drift.status, params.priorComposite);
  const escalated = gate.escalated;
  if (!escalated) {
    return { drift, drifting, stage2, escalated, escalationReason: gate.reason, cost };
  }

  // Stage 3 — synthesize the RE-KYC alert.
  const alertId = params.alertId ?? `alert-${baseline.entityId}-${Date.now()}`;
  const { alert, usage, model } = await synthesizeAlert({
    config,
    baseline,
    drift,
    signals,
    archetypes,
    alertId,
    relationshipPaths: relationshipPathsFromSignals(evidence),
  });
  tally(model, usage);

  return {
    drift,
    drifting,
    stage2,
    escalated,
    escalationReason: gate.reason,
    stage3: { alert, usage, model },
    cost,
  };
}
