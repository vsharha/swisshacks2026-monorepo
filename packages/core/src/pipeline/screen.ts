import { matchSanctions, type SanctionsEntry } from "../connectors/opensanctions.ts";
import { countryRisk, FATF_REFERENCE_URL } from "../drift/countryRisk.ts";
import { sourceQuality } from "../drift/confidence.ts";
import { SignalSchema, type KYCBaseline, type Signal } from "../schemas/index.ts";

/**
 * Static screening (proposal 6): a deterministic, point-in-time screen of the
 * named people and their countries. Matches the entity, its beneficial owners
 * and directors against the sanctions/PEP list, and scores owner nationality
 * against the country-risk reference. Emits canonical `Signal`s on
 * ownership / reputation / jurisdiction, so Stage 1/2/3 consume them unchanged.
 * Pure: the caller supplies the sanctions `entries` (the `opensanctions`
 * connector or its bundled sample fixture).
 */
export function screenEntity(
  baseline: KYCBaseline,
  entries: SanctionsEntry[],
  asOf: string,
): Signal[] {
  const signals: Signal[] = [];
  const sanctionsConfidence = sourceQuality("opensanctions");
  const regulatorConfidence = sourceQuality("regulator");

  // Entity name itself on a sanctions list → reputation.
  const entityHit = matchSanctions(baseline.name, entries);
  if (entityHit) {
    signals.push(
      SignalSchema.parse({
        id: `screen-${baseline.entityId}-entity`,
        entityId: baseline.entityId,
        axis: "reputation",
        type: "sanctioned_entity",
        date: asOf,
        sourceUrl: entityHit.sourceUrl,
        title: `Entity "${baseline.name}" matches ${entityHit.list} (${entityHit.type}).`,
        source: "opensanctions",
        payload: { list: entityHit.list, matchType: entityHit.type },
        confidence: sanctionsConfidence,
      }),
    );
  }

  baseline.beneficialOwners.forEach((owner, i) => {
    // Sanctions / PEP match on the owner / director name.
    const hit = matchSanctions(owner.name, entries);
    if (hit) {
      const sanctioned = hit.type === "sanction";
      signals.push(
        SignalSchema.parse({
          id: `screen-${baseline.entityId}-owner-${i}-${hit.type}`,
          entityId: baseline.entityId,
          axis: sanctioned ? "ownership" : "reputation",
          type: sanctioned ? "sanctioned_controller" : "pep_individual",
          date: asOf,
          sourceUrl: hit.sourceUrl,
          title: `Beneficial owner "${owner.name}" matches ${hit.list} (${hit.type}).`,
          source: "opensanctions",
          payload: { owner: owner.name, list: hit.list, matchType: hit.type },
          confidence: sanctionsConfidence,
        }),
      );
    }

    // Owner country-of-origin risk → jurisdiction.
    if (owner.nationality) {
      const risk = countryRisk(owner.nationality);
      if (risk.level !== "standard") {
        signals.push(
          SignalSchema.parse({
            id: `screen-${baseline.entityId}-owner-${i}-country`,
            entityId: baseline.entityId,
            axis: "jurisdiction",
            type: "owner_country_risk",
            date: asOf,
            sourceUrl: FATF_REFERENCE_URL,
            title: `Owner "${owner.name}" nationality ${owner.nationality} is ${risk.level}-risk: ${risk.reason}`,
            source: "regulator",
            payload: { owner: owner.name, country: owner.nationality, level: risk.level },
            confidence: regulatorConfidence,
          }),
        );
      }
    }
  });

  return signals;
}
