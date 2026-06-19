import { z } from "zod";
import { DriftAxisSchema, EventDate } from "./common.ts";
import { CitationSchema } from "./alert.ts";

/** One dated beat in an archetype's arc. */
export const ArcEventSchema = z.object({
  date: EventDate,
  label: z.string().min(1),
});
export type ArcEvent = z.infer<typeof ArcEventSchema>;

/**
 * A known drift archetype with a documented outcome — the pattern library that
 * upgrades the product from detection to judgment. At Stage 3 a live entity's
 * drift signature is matched against these to output an outcome prior, not just
 * an alert. Reference knowledge, not a monitored customer.
 */
export const PatternArchetypeSchema = z.object({
  id: z.string().min(1), // e.g. "long-blockchain-2017"
  name: z.string().min(1), // e.g. "Long Blockchain Corp (2017)"
  period: z.string().min(1), // e.g. "2017–2021"
  summary: z.string().min(1),
  /** Axes that characteristically fire for this archetype (its signature). */
  axes: z.array(DriftAxisSchema).min(1),
  /** Ordered arc of events that define the archetype. */
  arc: z.array(ArcEventSchema).min(1),
  /** Documented base-rate outcome. */
  outcome: z.string().min(1),
  /** Keywords for cheap first-pass matching against live signals. */
  keywords: z.array(z.string()).default([]),
  citations: z.array(CitationSchema).min(1),
});
export type PatternArchetype = z.infer<typeof PatternArchetypeSchema>;
