import { z } from "zod";
import { EventDate } from "../schemas/common.ts";
import { SignalSchema, type Signal } from "../schemas/index.ts";

/**
 * Hiring-trends connector: rapid hiring, freezes, headcount drops, and hiring
 * *pivots* (a focus shift toward a new domain) as structured drift evidence.
 * Mirrors the `market` connector — deterministic transform + sample fixture do
 * the demo work; the live `fetchHiringEvents` is a documented key seam (LinkedIn
 * has no usable free API). A surge/freeze/drop is `scale` (activity tempo); a
 * pivot is a `business_model` tell, often before it surfaces in the news.
 */

export const HiringEventSchema = z.object({
  entityId: z.string().min(1),
  kind: z.enum(["hiring_surge", "hiring_freeze", "headcount_drop", "hiring_pivot"]),
  /** Current headcount, when known. */
  headcount: z.number().optional(),
  /** Headcount or open-roles change, percent. */
  changePct: z.number().optional(),
  /** Current open-role count, when known. */
  openRoles: z.number().optional(),
  /** For a pivot: the new hiring focus (e.g. "digital asset custody & AML"). */
  focus: z.string().optional(),
  date: EventDate,
  sourceUrl: z.url(),
  title: z.string().min(1),
});
export type HiringEvent = z.infer<typeof HiringEventSchema>;

/** Per-kind confidence: a pivot is inferred (softer) than a headcount move. */
const HIRING_CONFIDENCE: Record<HiringEvent["kind"], number> = {
  hiring_surge: 0.72,
  hiring_freeze: 0.72,
  headcount_drop: 0.72,
  hiring_pivot: 0.6,
};

/** Map a structured hiring event to a drift Signal. */
export function hiringEventToSignals(event: HiringEvent): Signal[] {
  return [
    SignalSchema.parse({
      id: `linkedin-${event.entityId}-${event.kind}-${event.date}`,
      entityId: event.entityId,
      axis: event.kind === "hiring_pivot" ? "business_model" : "scale",
      type: event.kind,
      date: event.date,
      sourceUrl: event.sourceUrl,
      title: event.title,
      source: "linkedin",
      payload: {
        headcount: event.headcount ?? null,
        changePct: event.changePct ?? null,
        openRoles: event.openRoles ?? null,
        focus: event.focus ?? null,
      },
      confidence: HIRING_CONFIDENCE[event.kind],
    } satisfies Record<string, unknown>),
  ];
}

export interface FetchHiringEventsParams {
  apiKey?: string;
  entityId?: string;
}

/**
 * Live hiring-data fetch — scaffold. With no API key, returns [] and logs the key
 * seam rather than throwing, so the demo runs off the bundled fixture.
 */
export async function fetchHiringEvents(params: FetchHiringEventsParams): Promise<HiringEvent[]> {
  if (!params.apiKey) {
    console.warn("[linkedin] no apiKey — set LINKEDIN_API_KEY for live hiring data; returning []");
    return [];
  }
  console.warn("[linkedin] live hiring feed not implemented yet; returning []");
  return [];
}
