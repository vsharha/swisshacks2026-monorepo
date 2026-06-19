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
];

for (const baseline of baselines) {
  const out = await writeData(`baselines/${baseline.entityId}.json`, baseline);
  console.log(`Wrote baseline "${baseline.entityId}" (${baseline.riskRating}) → ${out}`);
}
