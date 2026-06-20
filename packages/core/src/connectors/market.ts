import { z } from "zod";
import { EventDate } from "../schemas/common.ts";
import { SignalSchema, type Signal } from "../schemas/index.ts";

/**
 * Market-intelligence connector (proposal 12 §4): funding rounds, liquidity and
 * valuation events and exchange-performance moves as **structured `scale`
 * evidence** rather than second-hand news mentions — the same axis a fiat raise
 * already moves, but sourced from a market feed with its own `SOURCE_QUALITY`
 * prior. Deterministic transform + a sample fixture do the demo work; the live
 * `fetchMarketEvents` is a documented key seam.
 */

export const MarketEventSchema = z.object({
  entityId: z.string().min(1),
  kind: z.enum(["funding_round", "valuation_change", "liquidity_event", "exchange_performance"]),
  amountUsd: z.number().optional(),
  valuationUsd: z.number().optional(),
  /** Percentage change for valuation / performance events. */
  changePct: z.number().optional(),
  date: EventDate,
  sourceUrl: z.url(),
  title: z.string().min(1),
});
export type MarketEvent = z.infer<typeof MarketEventSchema>;

/** Map a structured market event to a `scale` Signal. */
export function marketEventToSignals(event: MarketEvent): Signal[] {
  return [
    SignalSchema.parse({
      id: `market-${event.entityId}-${event.kind}-${event.date}`,
      entityId: event.entityId,
      axis: "scale",
      type: event.kind,
      date: event.date,
      sourceUrl: event.sourceUrl,
      title: event.title,
      source: "market",
      payload: {
        amountUsd: event.amountUsd ?? null,
        valuationUsd: event.valuationUsd ?? null,
        changePct: event.changePct ?? null,
      },
      confidence: 0.8,
    } satisfies Record<string, unknown>),
  ];
}

export interface FetchMarketEventsParams {
  apiKey?: string;
  entityId?: string;
}

/**
 * Live market-data fetch — scaffold. With no API key, returns [] and logs the key
 * seam rather than throwing, so the demo runs off the bundled fixture.
 */
export async function fetchMarketEvents(params: FetchMarketEventsParams): Promise<MarketEvent[]> {
  if (!params.apiKey) {
    console.warn("[market] no apiKey — set MARKET_API_KEY for live market data; returning []");
    return [];
  }
  console.warn("[market] live market feed not implemented yet (proposal 12); returning []");
  return [];
}
