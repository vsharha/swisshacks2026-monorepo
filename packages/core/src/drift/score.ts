import {
  AXES,
  DriftVectorSchema,
  type AxisDrift,
  type DriftAxis,
  type DriftVector,
  type KYCBaseline,
  type RiskStatus,
  type Signal,
} from "../schemas/index.ts";

/**
 * Cheap-tier drift scoring (Stage 0/1): aggregate the signals on each axis into
 * a per-axis drift score and a weighted composite, deterministically and for
 * ~free. This is the tier that absorbs the ~99% of the book that hasn't moved;
 * the LLM tiers (Stage 2/3) only refine axes that cross a threshold here.
 *
 * The `asOf` parameter makes drift a function of time: only signals on or before
 * that instant count, so advancing the demo clock accumulates drift axis by axis.
 */

/** Composite weighting across axes. Tuned to the scenario; sums to 1. */
export const AXIS_WEIGHTS: Record<DriftAxis, number> = {
  business_model: 0.25,
  ownership: 0.25,
  scale: 0.2,
  reputation: 0.2,
  jurisdiction: 0.1,
};

/** Recency half-life in days — structural drift persists ~a year. */
const HALF_LIFE_DAYS = 365;

/** Saturation constant: how much weighted evidence ≈ full drift. */
const SATURATION_K = 3;

const ALERT_THRESHOLD = 0.7;
const WATCH_THRESHOLD = 0.4;

const MS_PER_DAY = 86_400_000;

export function statusForScore(score: number): RiskStatus {
  if (score >= ALERT_THRESHOLD) return "alert";
  if (score >= WATCH_THRESHOLD) return "watch";
  return "stable";
}

function recencyWeight(signalDate: string, asOf: string): number {
  const ageDays = (Date.parse(asOf) - Date.parse(signalDate)) / MS_PER_DAY;
  if (Number.isNaN(ageDays) || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function clusterBonus(signal: Signal): number {
  const size = Number(signal.payload.clusterSize ?? 1);
  return 1 + 0.15 * Math.log2(Math.max(size, 1));
}

/** Score a single axis from the signals attributed to it. */
export function scoreAxis(signals: Signal[], asOf: string): AxisDrift {
  if (signals.length === 0) {
    return { score: 0, confidence: 0, status: "stable", tierReached: "stage0", signalIds: [] };
  }

  let weighted = 0;
  let maxConfidence = 0;
  const sorted = [...signals].sort((a, b) => b.date.localeCompare(a.date));
  for (const s of sorted) {
    weighted += s.confidence * recencyWeight(s.date, asOf) * clusterBonus(s);
    maxConfidence = Math.max(maxConfidence, s.confidence);
  }

  const score = 1 - Math.exp(-weighted / SATURATION_K);
  const latest = sorted[0]!;
  return {
    score,
    confidence: maxConfidence,
    status: statusForScore(score),
    tierReached: "stage0",
    signalIds: sorted.map((s) => s.id),
    reasoning: `${signals.length} signal(s); latest: "${latest.title}" (${latest.date.slice(0, 10)}).`,
  };
}

export interface ScoreDriftOptions {
  /** Only signals on or before this instant count. Defaults to "now". */
  asOf?: string;
}

/**
 * Compute the full drift vector for an entity from its baseline and signals.
 * Signals after `asOf` are ignored so the result reflects the chosen clock.
 */
export function scoreDriftVector(
  baseline: KYCBaseline,
  signals: Signal[],
  options: ScoreDriftOptions = {},
): DriftVector {
  const asOf = options.asOf ?? new Date().toISOString();

  const relevant = signals.filter(
    (s) => s.entityId === baseline.entityId && s.date <= asOf,
  );
  const byAxis = new Map<DriftAxis, Signal[]>();
  for (const axis of AXES) byAxis.set(axis, []);
  for (const s of relevant) byAxis.get(s.axis)!.push(s);

  const axes = Object.fromEntries(
    AXES.map((axis) => [axis, scoreAxis(byAxis.get(axis)!, asOf)]),
  ) as Record<DriftAxis, AxisDrift>;

  const composite = AXES.reduce((sum, axis) => sum + axes[axis].score * AXIS_WEIGHTS[axis], 0);

  return DriftVectorSchema.parse({
    entityId: baseline.entityId,
    asOf,
    axes,
    composite,
    status: statusForScore(composite),
  });
}
