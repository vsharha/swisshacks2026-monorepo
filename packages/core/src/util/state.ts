import type { Signal } from "../schemas/index.ts";

/**
 * Stateful, incremental ingestion (proposal 10). A per-entity-per-source
 * watermark (the most recent signal date ingested) plus a `seen` set of signal
 * ids let a connector fetch only what is new — so ingestion cost scales with the
 * *rate of new signals*, the same change-triggered principle the cascade uses
 * downstream. These are the pure folds; the fs persistence lives in the scripts
 * package (`lib/state.ts`).
 */
export interface IngestState {
  /** Most recent ingested signal date (ISO) — the `since:` for the next fetch. */
  watermark?: string;
  /** Ids already emitted, so a re-pull never duplicates a signal. */
  seenIds: string[];
}

export const emptyState = (): IngestState => ({ seenIds: [] });

/**
 * The date to fetch from: the stored watermark, or `fallback` on a cold start.
 */
export function sinceDate(state: IngestState, fallback: string): string {
  return state.watermark ?? fallback;
}

/** Signals whose id has not been seen before, in input order. */
export function filterUnseen(signals: Signal[], state: IngestState): Signal[] {
  const seen = new Set(state.seenIds);
  return signals.filter((s) => !seen.has(s.id));
}

/**
 * Fold freshly-ingested signals into the state: advance the watermark to the
 * latest date and grow the seen set. Pure — returns a new state.
 */
export function advanceState(state: IngestState, signals: Signal[]): IngestState {
  const seen = new Set(state.seenIds);
  let watermark = state.watermark;
  for (const s of signals) {
    seen.add(s.id);
    if (!watermark || s.date > watermark) watermark = s.date;
  }
  return { watermark, seenIds: [...seen].sort() };
}
