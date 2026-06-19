import { extractSecSignals } from "@kyc/core/connectors";
import { loadRootEnv, writeData } from "../lib/repo.ts";

/**
 * Mode 1 offline extractor: pull the hero entity's SEC EDGAR filing history and
 * normalize the structural filings (rename, asset sale, financing, delisting)
 * into validated Signals. EDGAR is free + permanent, so this covers the
 * historical timeline EventRegistry can't reach. CIK 1653909 = Allbirds.
 * Run with `pnpm --filter @kyc/scripts extract:sec`.
 */

loadRootEnv();

const cik = process.env.SEC_CIK ?? "1653909";
const entityId = "smartbird";
// SEC requires a descriptive User-Agent with contact info.
const userAgent = process.env.SEC_USER_AGENT ?? "KYC-Drift-Monitor olivier.luethy@gmx.net";

const { signals, skipped, dropped } = await extractSecSignals({ cik, entityId, userAgent });
// Newest-first for the timeline / dashboard.
signals.sort((a, b) => b.date.localeCompare(a.date));

const out = await writeData(`signals/${entityId}.sec.json`, signals);

const byAxis = signals.reduce<Record<string, number>>((acc, s) => {
  acc[s.axis] = (acc[s.axis] ?? 0) + 1;
  return acc;
}, {});

console.log(`Funnel: classified ${signals.length} filings (${skipped} skipped, ${dropped} dropped)`);
console.log(`Range: ${signals.at(-1)?.date} → ${signals.at(0)?.date}`);
console.log(`Wrote ${signals.length} SEC signals → ${out}`);
console.log("By axis:", byAxis);
console.log(
  "Structural events:",
  signals
    .filter((s) => s.confidence >= 0.85)
    .slice(0, 12)
    .map((s) => `${s.date} ${s.title}`),
);
