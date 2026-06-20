import { z } from "zod";
import {
  Confidence,
  DriftAxisSchema,
  EventDate,
  SourceSchema,
} from "./common.ts";

/**
 * The canonical seam. Every source normalises to a Signal, and this is the
 * contract shared by the offline scripts and the live app ("one connector
 * layer, two callers"). Source-citation enforcement lives here: a Signal
 * without a `sourceUrl` cannot exist, so every downstream claim is citable.
 */
export const SignalSchema = z.object({
  /** Stable id, so drift verdicts and audit entries can reference a signal. */
  id: z.string().min(1),
  /** The customer this signal is about (after Stage 0 entity resolution). */
  entityId: z.string().min(1),
  /** Which drift axis this signal bears on. */
  axis: DriftAxisSchema,
  /** Discrete signal type, e.g. "rename" | "asset_sale" | "financing" | "adverse_media". */
  type: z.string().min(1),
  /** When the underlying event happened (not when it was ingested). */
  date: EventDate,
  /** Citation target — every signal is traceable to a source. */
  sourceUrl: z.url(),
  /** Human-readable headline / summary. */
  title: z.string().min(1),
  /** Which connector produced this signal (provenance). */
  source: SourceSchema,
  /** Source-specific structured extras (event cluster id, sentiment, CIK, etc.). */
  payload: z.record(z.string(), z.unknown()).default({}),
  /** Extraction confidence in [0, 1]. */
  confidence: Confidence,
  /**
   * Supporting market/external research context for this signal. Optional: the
   * UI derives a concise summary from `payload` when this is absent, so an
   * enrichment step (or hand-authored data) can override it later.
   */
  marketResearch: z.string().optional(),
  /**
   * Per-signal drift inference — what this event implies for the KYC baseline.
   * Optional for the same reason as `marketResearch`.
   */
  signalInference: z.string().optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const SignalArraySchema = z.array(SignalSchema);
