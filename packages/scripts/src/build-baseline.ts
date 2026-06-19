import { KYCBaselineSchema, type KYCBaseline } from "@kyc/core";
import { writeData } from "./lib/repo.ts";

/**
 * Mode 1 builder: assemble the curated KYC baseline profiles — the assumptions
 * each customer was onboarded under, which drift is measured against. Parsing
 * through KYCBaselineSchema makes the curation a real, validated contract.
 * Run with `pnpm --filter @kyc/scripts build:baseline`.
 */

const baselines: KYCBaseline[] = [
  // Hero: onboarded as a low-risk sustainable footwear brand, pre-drift.
  KYCBaselineSchema.parse({
    entityId: "smartbird",
    name: "Allbirds, Inc.",
    aliases: ["Allbirds", "NewBird AI", "Smartbird"],
    legalForm: "Delaware C corporation",
    jurisdiction: "US",
    businessModel:
      "Direct-to-consumer sustainable footwear and apparel — eco-friendly shoes made from natural materials (merino wool, eucalyptus, sugarcane).",
    beneficialOwners: [
      { name: "Timothy Brown", role: "Co-founder & Co-CEO (at onboarding)" },
      { name: "Joey Zwillinger", role: "Co-founder & Co-CEO (at onboarding)" },
    ],
    riskRating: "low",
    onboardedAt: "2021-11-03",
    conceptUri: "http://en.wikipedia.org/wiki/Allbirds",
    cik: "1653909",
    domain: "https://www.allbirds.com",
  } satisfies Record<string, unknown>),

  // Background book — deliberately stable customers. They prove the cheap tiers
  // absorb most of the book for ~$0 (cost story) and that the system has a low
  // false-positive rate (specificity). No signals → they never escalate.
  KYCBaselineSchema.parse({
    entityId: "helvetia-trading",
    name: "Helvetia Trading AG",
    aliases: ["Helvetia Trading"],
    legalForm: "Swiss Aktiengesellschaft",
    jurisdiction: "CH",
    businessModel: "Commodity trading and logistics for Swiss agricultural exports.",
    beneficialOwners: [{ name: "Familie Brunner", role: "Majority owner" }],
    riskRating: "low",
    onboardedAt: "2019-03-12",
  } satisfies Record<string, unknown>),
  KYCBaselineSchema.parse({
    entityId: "alpine-components",
    name: "Alpine Components AG",
    aliases: ["Alpine Components"],
    legalForm: "Swiss Aktiengesellschaft",
    jurisdiction: "CH",
    businessModel: "Precision-machined components for industrial and medical equipment.",
    beneficialOwners: [{ name: "Alpine Holding SA", share: 1, role: "Parent" }],
    riskRating: "low",
    onboardedAt: "2017-06-01",
  } satisfies Record<string, unknown>),
  KYCBaselineSchema.parse({
    entityId: "nordtrade-holding",
    name: "NordTrade Holding",
    aliases: ["NordTrade"],
    legalForm: "Holding company",
    jurisdiction: "DE",
    businessModel: "Payment processing and merchant acquiring across the EU.",
    beneficialOwners: [{ name: "Disclosed nominee structure", role: "Beneficial owner (layered)" }],
    riskRating: "medium",
    onboardedAt: "2020-09-30",
  } satisfies Record<string, unknown>),
];

for (const baseline of baselines) {
  const out = await writeData(`baselines/${baseline.entityId}.json`, baseline);
  console.log(`Wrote baseline "${baseline.entityId}" (${baseline.riskRating}) → ${out}`);
}
