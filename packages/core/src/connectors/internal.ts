import { z } from "zod";
import { DriftAxisSchema, EventDate, RiskRatingSchema } from "../schemas/common.ts";
import {
  OutcomeSchema,
  SignalSchema,
  type AuditEntry,
  type DriftAxis,
  type Signal,
} from "../schemas/index.ts";

/**
 * Internal / MCP intelligence — the outcome-feedback loop (proposal 13). Surfaces
 * the bank's *own* history (past KYC decisions, investigations,
 * transaction-monitoring anomalies, profile changes) as `Signal`s and as
 * `Outcome` audit entries. This is the source that closes the confidence engine's
 * fourth term: realized outcomes vs. past drift verdicts finally populate
 * *historical accuracy* (see `historicalAccuracyFromOutcomes`). Internal records
 * carry regulator-grade confidence and reuse the canonical seam;
 * transaction-monitoring anomalies route to the existing `reputation` /
 * `ownership` axes — **no new AML axis**, the 5-axis model holds. The live
 * MCP-server fetch is a documented scaffold (interactive-auth servers may be
 * absent in headless runs).
 */

export const InternalRecordSchema = z.object({
  entityId: z.string().min(1),
  kind: z.enum(["kyc_decision", "investigation", "txn_anomaly", "profile_change"]),
  date: EventDate,
  summary: z.string().min(1),
  /** Internal case-management link (the citation target). */
  sourceUrl: z.url(),
  /** Axis this record bears on; defaults by kind when omitted. */
  axis: DriftAxisSchema.optional(),
  /** A realized risk-rating change, when this record closed a review. */
  outcome: z
    .object({ fromRating: RiskRatingSchema, toRating: RiskRatingSchema })
    .optional(),
});
export type InternalRecord = z.infer<typeof InternalRecordSchema>;

/** Default axis per record kind (no new AML axis — route into the 5). */
const DEFAULT_AXIS: Record<InternalRecord["kind"], DriftAxis> = {
  kyc_decision: "reputation",
  investigation: "reputation",
  txn_anomaly: "reputation",
  profile_change: "ownership",
};

/** Map internal records to canonical `reputation`/`ownership` Signals. */
export function internalRecordsToSignals(records: InternalRecord[]): Signal[] {
  return records.map((r) =>
    SignalSchema.parse({
      id: `internal-${r.entityId}-${r.kind}-${r.date}`,
      entityId: r.entityId,
      axis: r.axis ?? DEFAULT_AXIS[r.kind],
      type: r.kind,
      date: r.date,
      sourceUrl: r.sourceUrl,
      title: `Internal ${r.kind.replace(/_/g, " ")}: ${r.summary}`,
      source: "internal",
      payload: { kind: r.kind, hasOutcome: Boolean(r.outcome) },
      confidence: 0.9,
    } satisfies Record<string, unknown>),
  );
}

/**
 * Realized rating changes from internal records, as `Outcome` audit entries — the
 * raw material for the confidence engine's historical-accuracy term. `ts` is the
 * record date normalized to a timestamp (no `new Date()` in core).
 */
export function internalRecordsToOutcomes(records: InternalRecord[]): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const r of records) {
    if (!r.outcome) continue;
    const ts = /T/.test(r.date) ? r.date : `${r.date}T00:00:00Z`;
    out.push(
      OutcomeSchema.parse({
        id: `outcome-${r.entityId}-${r.date}`,
        ts,
        entityId: r.entityId,
        kind: "outcome",
        fromRating: r.outcome.fromRating,
        toRating: r.outcome.toRating,
      }),
    );
  }
  return out;
}

export interface FetchInternalParams {
  /** MCP server endpoint / token; absent in headless or unauthenticated runs. */
  mcpToken?: string;
  entityId?: string;
}

/**
 * Live internal/MCP fetch — scaffold. Interactively-authenticated MCP servers may
 * be absent in headless/cron runs, so with no token this logs and returns [];
 * the demo runs off the bundled fixture.
 */
export async function fetchInternalRecords(params: FetchInternalParams): Promise<InternalRecord[]> {
  if (!params.mcpToken) {
    console.warn("[internal] no mcpToken — set INTERNAL_MCP_TOKEN for the live history feed; returning []");
    return [];
  }
  console.warn("[internal] live MCP fetch not implemented yet (proposal 13); returning []");
  return [];
}
