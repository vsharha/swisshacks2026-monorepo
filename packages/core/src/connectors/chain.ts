import { z } from "zod";
import { Confidence, Score } from "../schemas/common.ts";
import { SignalSchema, type GraphEdge, type GraphNode, type Signal } from "../schemas/index.ts";
import { nodeIdFor } from "../graph/build.ts";

/**
 * Blockchain / crypto-asset intelligence (proposal 14). Crypto is treated as an
 * asset-exposure *lens on ordinary clients*, not a client type (AMINA's framing):
 * every output is a normal `Signal` on an existing axis.
 *   • wallet screening → `reputation` (illicit-flow proximity) and, when a
 *     counterparty is sanctioned, `ownership` (a sanctioned wallet *is* a
 *     sanctions hit, composing with the proposal-6 screen);
 *   • a treasury shift into digital assets / a jump in on-chain volume → ordinary
 *     `business_model` (what the company holds) and `scale` (volume, tempo) drift
 *     — the same axes a fiat funding round moves (the MicroStrategy hero case).
 * Framework-agnostic scaffold: the deterministic transforms + a sample fixture do
 * the demo work; the live `fetchWalletScreening` is a documented key seam.
 */

// --- Wallet screening ---------------------------------------------------------

export const WalletScreeningSchema = z.object({
  entityId: z.string().min(1),
  address: z.string().min(1),
  /** Chain label, e.g. "bitcoin", "ethereum". */
  chain: z.string().min(1),
  /** Proximity scores in [0,1] to illicit categories. */
  exposure: z
    .object({
      mixer: Score.optional(),
      darknet: Score.optional(),
    })
    .default({}),
  /** Names of sanctioned counterparties this wallet transacted with. */
  sanctionedCounterparties: z.array(z.string()).default([]),
  sourceUrl: z.url(),
});
export type WalletScreening = z.infer<typeof WalletScreeningSchema>;

/** Illicit-exposure score above which a reputation signal is emitted. */
const ILLICIT_THRESHOLD = 0.3;

export function walletScreeningToSignals(screening: WalletScreening, asOf: string): Signal[] {
  const signals: Signal[] = [];
  const base = {
    entityId: screening.entityId,
    date: asOf,
    sourceUrl: screening.sourceUrl,
    source: "chain" as const,
  };

  // A sanctioned counterparty is a sanctions hit on the ownership axis.
  if (screening.sanctionedCounterparties.length > 0) {
    signals.push(
      SignalSchema.parse({
        ...base,
        id: `chain-${screening.entityId}-${screening.address}-sanctioned`,
        axis: "ownership",
        type: "sanctioned_wallet",
        title: `Disclosed wallet ${screening.address} transacted with sanctioned counterpart(y/ies): ${screening.sanctionedCounterparties.join(", ")}.`,
        payload: { address: screening.address, chain: screening.chain, counterparties: screening.sanctionedCounterparties },
        confidence: 0.95,
      }),
    );
  }

  // Mixer / darknet proximity → reputation (illicit-flow exposure).
  const illicit = Math.max(screening.exposure.mixer ?? 0, screening.exposure.darknet ?? 0);
  if (illicit >= ILLICIT_THRESHOLD) {
    signals.push(
      SignalSchema.parse({
        ...base,
        id: `chain-${screening.entityId}-${screening.address}-illicit`,
        axis: "reputation",
        type: "illicit_flow_exposure",
        title: `Wallet ${screening.address} shows illicit-flow proximity (mixer ${(screening.exposure.mixer ?? 0).toFixed(2)}, darknet ${(screening.exposure.darknet ?? 0).toFixed(2)}).`,
        payload: { address: screening.address, chain: screening.chain, exposure: screening.exposure },
        confidence: Confidence.parse(0.6 + 0.3 * illicit),
      }),
    );
  }
  return signals;
}

// --- On-chain treasury / flow as business-model + scale evidence --------------

export const TreasuryEventSchema = z.object({
  entityId: z.string().min(1),
  asset: z.string().min(1),
  /** "shift_to" digital assets, "shift_from", or "volume_jump". */
  kind: z.enum(["shift_to", "shift_from", "volume_jump"]),
  /** Magnitude in USD, when known. */
  magnitudeUsd: z.number().optional(),
  /** Fraction of treasury / balance affected, when known. */
  share: Score.optional(),
  date: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
  sourceUrl: z.url(),
  title: z.string().min(1),
});
export type TreasuryEvent = z.infer<typeof TreasuryEventSchema>;

export function treasuryEventToSignals(event: TreasuryEvent): Signal[] {
  const base = {
    entityId: event.entityId,
    date: event.date,
    sourceUrl: event.sourceUrl,
    source: "chain" as const,
    payload: { asset: event.asset, kind: event.kind, magnitudeUsd: event.magnitudeUsd ?? null, share: event.share ?? null },
  };
  // What the company holds/does → business_model; magnitude/tempo → scale.
  return [
    SignalSchema.parse({
      ...base,
      id: `chain-${event.entityId}-${event.asset}-bm`,
      axis: "business_model",
      type: "treasury_composition",
      title: event.title,
      confidence: 0.85,
    }),
    SignalSchema.parse({
      ...base,
      id: `chain-${event.entityId}-${event.asset}-scale`,
      axis: "scale",
      type: "treasury_shift",
      title: event.title,
      confidence: 0.8,
    }),
  ];
}

// --- Graph integration (proposal 14 §3): wallet nodes + TRANSACTS_WITH --------

/**
 * Graph elements for a wallet screening: a `wallet` node for the disclosed
 * address tied to its entity, and a `TRANSACTS_WITH` edge to each sanctioned
 * counterparty — so on-chain exposure propagates exactly as a sanctioned UBO does
 * (composes with the proposal 3/5 walk).
 */
export function walletGraphElements(
  screening: WalletScreening,
  entityName: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const walletId = nodeIdFor(screening.address, "wallet");
  const entityId = nodeIdFor(entityName, "entity");
  const nodes: GraphNode[] = [{ id: walletId, type: "wallet", label: screening.address }];
  const edges: GraphEdge[] = [{ from: entityId, to: walletId, type: "TRANSACTS_WITH" }];
  for (const cp of screening.sanctionedCounterparties) {
    const cpId = nodeIdFor(cp, "wallet");
    nodes.push({ id: cpId, type: "wallet", label: cp });
    edges.push({ from: walletId, to: cpId, type: "TRANSACTS_WITH", sourceUrl: screening.sourceUrl });
  }
  return { nodes, edges };
}

// --- Live fetch scaffold ------------------------------------------------------

export interface FetchWalletScreeningParams {
  apiKey?: string;
  address: string;
}

/**
 * Live wallet-screening fetch — scaffold. With no API key, returns null and logs
 * the key seam rather than throwing, so the demo runs off the bundled fixture and
 * nothing fake-passes as a live screen. Wiring a provider is deferred.
 */
export async function fetchWalletScreening(
  params: FetchWalletScreeningParams,
): Promise<WalletScreening | null> {
  if (!params.apiKey) {
    console.warn("[chain] no apiKey — set CHAIN_API_KEY for live wallet screening; returning null");
    return null;
  }
  console.warn("[chain] live wallet screening not implemented yet (proposal 14); returning null");
  return null;
}
