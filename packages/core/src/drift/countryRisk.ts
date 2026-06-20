/**
 * Country-risk reference (proposal 4): a small, bundled list modelled on the
 * FATF "high-risk jurisdictions subject to a call for action" (black list) and
 * "jurisdictions under increased monitoring" (grey list). Bundled as a const —
 * like SOURCE_QUALITY — so the deterministic enrichers stay pure and testable.
 * This is a sample for the demo, not an authoritative live FATF feed (that is
 * proposal 12's regulator connector); unlisted countries are `standard`.
 */
export type CountryRiskLevel = "high" | "increased" | "standard";

export interface CountryRisk {
  level: CountryRiskLevel;
  reason: string;
}

/** Citation target for country-risk signals. */
export const FATF_REFERENCE_URL =
  "https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html";

/** ISO 3166-1 alpha-2 → risk. Keys are uppercase. */
export const COUNTRY_RISK: Record<string, CountryRisk> = {
  IR: { level: "high", reason: "FATF call-for-action (black list)." },
  KP: { level: "high", reason: "FATF call-for-action (black list)." },
  MM: { level: "high", reason: "FATF call-for-action (black list)." },
  SY: { level: "increased", reason: "FATF increased monitoring (grey list)." },
  YE: { level: "increased", reason: "FATF increased monitoring (grey list)." },
};

/** Risk for an ISO alpha-2 country code; `standard` if unlisted. */
export function countryRisk(code: string): CountryRisk {
  return (
    COUNTRY_RISK[code.toUpperCase()] ?? {
      level: "standard",
      reason: "Not on the modelled FATF high-risk / increased-monitoring lists.",
    }
  );
}
