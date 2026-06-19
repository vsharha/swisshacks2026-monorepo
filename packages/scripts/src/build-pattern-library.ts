import { PatternArchetypeSchema, type PatternArchetype } from "@kyc/core";
import { writeData } from "./lib/repo.ts";

/**
 * Mode 1 builder: assemble the pattern library of known drift archetypes with
 * documented outcomes. Stage 3 matches a live entity's drift signature against
 * these to output an outcome prior. Run with
 * `pnpm --filter @kyc/scripts build:patterns`.
 */

const archetypes: PatternArchetype[] = [
  PatternArchetypeSchema.parse({
    id: "long-blockchain-2017",
    name: "Long Blockchain Corp (2017)",
    period: "2017–2021",
    summary:
      "A struggling consumer beverage brand (Long Island Iced Tea Corp) rebranded around a hot buzzword (blockchain), with thin underlying substance. The rename triggered a ~500% stock spike that drew regulatory scrutiny and ended in delisting and insider-trading charges. The archetype: struggling consumer brand + hot buzzword + rename + stock pump + little real business change.",
    axes: ["business_model", "scale", "reputation"],
    arc: [
      { date: "2017-12-21", label: "Renames Long Island Iced Tea Corp → Long Blockchain Corp" },
      { date: "2017-12-21", label: "Stock spikes ~500% on the rename, on thin substance" },
      { date: "2018-06-01", label: "Nasdaq delists the company" },
      { date: "2021-02-01", label: "SEC revokes the company's registration" },
      { date: "2021-07-14", label: "SEC files insider-trading charges tied to the rename" },
    ],
    outcome:
      "Adverse. Nasdaq delisting, SEC registration revoked, and insider-trading charges. The base-rate outcome for this archetype is severe regulatory action → recommend enhanced due diligence and re-KYC when a live entity matches.",
    keywords: [
      "rename",
      "rebrand",
      "buzzword",
      "blockchain",
      "AI pivot",
      "stock pump",
      "spike",
      "thin substance",
      "struggling brand",
      "delisting",
    ],
    citations: [
      {
        sourceUrl: "https://www.sec.gov/news/press-release/2021-118",
        title: "SEC Charges Three Individuals in Long Blockchain Insider Trading Scheme (Jul 2021)",
      },
      {
        sourceUrl: "https://en.wikipedia.org/wiki/Long_Blockchain_Corp",
        title: "Long Blockchain Corp — company overview and timeline",
      },
    ],
  } satisfies Record<string, unknown>),
];

for (const archetype of archetypes) {
  const out = await writeData(`pattern-library/${archetype.id}.json`, archetype);
  console.log(`Wrote archetype "${archetype.id}" (${archetype.axes.join(", ")}) → ${out}`);
}
