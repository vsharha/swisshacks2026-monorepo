import { type Signal, type Source } from "../schemas/index.ts";

/**
 * Per-connector source-quality prior in [0, 1]: how far we trust a source's
 * claims before any corroboration. Regulator/registry feeds are near
 * ground-truth; news and manual entries are softer. The spine of the confidence
 * engine (proposal 1); covers exactly the current Source enum — new sources add
 * their prior here in the phase that introduces their connector.
 */
export const SOURCE_QUALITY: Record<Source, number> = {
  opensanctions: 0.97,
  gleif: 0.95,
  regulator: 0.92,
  sec_edgar: 0.95,
  internal: 0.9, // the bank's own verified records (proposal 13)
  opencorporates: 0.85,
  market: 0.8, // structured market-event feeds (proposal 12)
  chain: 0.78, // on-chain / wallet-screening providers (proposal 14)
  graph: 0.7,
  wayback: 0.7,
  eventregistry: 0.7,
  rss: 0.65,
  manual: 0.6,
};

/** Source-quality prior for a source, defaulting to a cautious mid value. */
export function sourceQuality(source: Source): number {
  return SOURCE_QUALITY[source] ?? 0.6;
}

/** Recency half-life in days — structural drift persists ~a year. */
const HALF_LIFE_DAYS = 365;
const MS_PER_DAY = 86_400_000;

/**
 * Exponential recency weight in (0, 1]: 1 at (or after) `asOf`, halving every
 * HALF_LIFE_DAYS. Shared by the cheap-tier score (freshness of evidence) and the
 * confidence engine's freshness term.
 */
export function recencyWeight(signalDate: string, asOf: string): number {
  const ageDays = (Date.parse(asOf) - Date.parse(signalDate)) / MS_PER_DAY;
  if (Number.isNaN(ageDays) || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/**
 * Confidence on an axis as an explicit weighted blend (proposal 1), replacing
 * the old single-signal max-of-confidences proxy:
 *
 *   0.40·source quality + 0.25·corroboration + 0.20·freshness + 0.15·historical
 *
 * `historical accuracy` has no live track record in demo scope, so it falls back
 * to the source-quality prior (a second source-quality term) UNTIL the
 * outcome-feedback loop (proposal 13) supplies realized outcomes — pass
 * `historicalAccuracy` (e.g. from `historicalAccuracyFromOutcomes`) to make the
 * fourth term live. Risk and confidence stay separate: this writes
 * AxisDrift.confidence only.
 */
export function confidenceForAxis(
  signals: Signal[],
  asOf: string,
  historicalAccuracy?: number,
): number {
  if (signals.length === 0) return 0;
  let quality = 0;
  let freshness = 0;
  const sources = new Set<Source>();
  for (const s of signals) {
    quality = Math.max(quality, sourceQuality(s.source));
    freshness = Math.max(freshness, recencyWeight(s.date, asOf));
    sources.add(s.source);
  }
  // Independent corroboration: 1 source → 0, 2 → 0.5, 3+ → 1.
  const corroboration = Math.min(1, (sources.size - 1) / 2);
  // Live track record when supplied (proposal 13), else the source-quality stub.
  const historical = historicalAccuracy ?? quality;
  return 0.4 * quality + 0.25 * corroboration + 0.2 * freshness + 0.15 * historical;
}

/**
 * Historical-accuracy term for the confidence engine (proposal 13): the fraction
 * of past drift verdicts on this entity that the bank's realized outcomes
 * confirmed. With no track record yet, returns a cautious neutral prior rather
 * than a confident 0 or 1.
 */
export function historicalAccuracyFromOutcomes(correct: number, total: number): number {
  if (total <= 0) return 0.6;
  return Math.max(0, Math.min(1, correct / total));
}
