import { countryRisk, FATF_REFERENCE_URL } from "../../drift/countryRisk.ts";
import { sourceQuality } from "../../drift/confidence.ts";
import { SignalSchema, type KYCBaseline, type Signal } from "../../schemas/index.ts";

/**
 * Geopolitical enricher (proposal 4): score the company domicile against the
 * country-risk reference and emit a deterministic `jurisdiction` Signal when it
 * is high-risk or under increased monitoring. No LLM — Stage 0/1. Owner-level
 * country-of-origin is screened separately in `screen.ts` (proposal 6), reusing
 * `countryRisk`.
 */
export function countryRiskSignals(baseline: KYCBaseline, asOf: string): Signal[] {
  const risk = countryRisk(baseline.jurisdiction);
  if (risk.level === "standard") return [];
  const signal = SignalSchema.parse({
    id: `geo-${baseline.entityId}-domicile`,
    entityId: baseline.entityId,
    axis: "jurisdiction",
    type: "country_risk",
    date: asOf,
    sourceUrl: FATF_REFERENCE_URL,
    title: `Domicile ${baseline.jurisdiction} is ${risk.level}-risk: ${risk.reason}`,
    source: "regulator",
    payload: { country: baseline.jurisdiction, level: risk.level },
    confidence: sourceQuality("regulator"),
  });
  return [signal];
}
