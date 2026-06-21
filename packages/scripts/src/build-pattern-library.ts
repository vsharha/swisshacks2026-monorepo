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
  PatternArchetypeSchema.parse({
    id: "overstock-blockchain-2018",
    name: "Overstock.com crypto-treasury pivot (2018)",
    period: "2017–2020",
    summary:
      "An established operating company (the online retailer Overstock.com) over-rotated its balance sheet and strategy into a single crypto/blockchain theme — pouring capital into the tZERO security-token platform and a portfolio of blockchain bets via Medici Ventures while the retail core stagnated. The blockchain narrative roughly tripled the stock in late 2017, detaching its market value from the underlying operating business and turning it into a NAV-driven crypto proxy. The bet ran under a controlling, founder-CEO (Patrick Byrne), whose concentrated governance and abrupt 2019 exit — liquidating his entire stake into gold and crypto — left the strategy stranded. The archetype: a real, substantive company converts itself into a leveraged, concentrated single-asset crypto-treasury vehicle under founder control, whose value untethers from operations and unwinds reflexively when the narrative breaks. Distinct from the buzzword-shell rename (cf. long-blockchain-2017) — here the operating business is genuine; the risk is strategic over-rotation, leverage, and ownership concentration, not fraud.",
    axes: ["business_model", "ownership", "scale"],
    arc: [
      { date: "2017-08-01", label: "Pushes capital into tZERO and blockchain bets via Medici Ventures" },
      { date: "2017-12-01", label: "Stock surges ~3x as the company rebrands around blockchain, detaching from retail" },
      { date: "2018-08-01", label: "tZERO security-token offering closes (~$134M raised)" },
      { date: "2019-08-22", label: "Founder-CEO Patrick Byrne resigns amid a governance scandal; liquidates his entire stake" },
      { date: "2020-01-01", label: "Blockchain bets stall and the stock round-trips its surge; the company retreats from the strategy" },
    ],
    outcome:
      "Adverse. The crypto-treasury over-rotation failed to deliver: the stock round-tripped its surge, the founder-CEO exited under a governance cloud and dumped his stake, and the company retreated from the strategy. The base-rate outcome for an operating company that converts into a leveraged, single-asset crypto-treasury proxy under concentrated founder control is a reflexive unwind and ownership/governance instability → recommend enhanced due diligence and re-KYC when a live entity matches.",
    keywords: [
      "crypto treasury",
      "digital asset treasury",
      "bitcoin",
      "blockchain pivot",
      "balance-sheet conversion",
      "single-asset",
      "concentration",
      "leverage",
      "convertible debt",
      "NAV premium",
      "founder control",
      "super-voting",
      "controlling shareholder",
      "stock surge",
      "reflexive unwind",
      "security token",
    ],
    citations: [
      {
        sourceUrl: "https://en.wikipedia.org/wiki/Overstock.com",
        title: "Overstock.com — tZERO/blockchain pivot and the 2019 founder-CEO resignation",
      },
      {
        sourceUrl: "https://en.wikipedia.org/wiki/Patrick_M._Byrne",
        title: "Patrick Byrne — Overstock founder-CEO, 2019 resignation and stake liquidation",
      },
    ],
  } satisfies Record<string, unknown>),
];

for (const archetype of archetypes) {
  const out = await writeData(`pattern-library/${archetype.id}.json`, archetype);
  console.log(`Wrote archetype "${archetype.id}" (${archetype.axes.join(", ")}) → ${out}`);
}
