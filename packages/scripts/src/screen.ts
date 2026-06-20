import { countryRiskSignals, screenEntity } from "@kyc/core/pipeline";
import { SanctionsEntrySchema, type SanctionsEntry } from "@kyc/core/connectors";
import { KYCBaselineSchema, type Signal } from "@kyc/core";
import { readData, writeData } from "./lib/repo.ts";

/**
 * Offline screen: run the deterministic geo enricher (proposal 4) + sanctions/PEP
 * + country-of-origin screen (proposal 6) for one entity and write the resulting
 * Signals to data/signals/<entityId>.screen.json, where the live app loads them
 * like any other source. Pass an entityId as the first arg (defaults to
 * "gulf-bridge-capital"). The screen date defaults to today's scenario instant.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/screen.ts <entityId> [asOf]
 */

const entityId = process.argv[2] ?? "gulf-bridge-capital";
const asOf = process.argv[3] ?? "2026-06-20";

const baseline = KYCBaselineSchema.parse(await readData(`baselines/${entityId}.json`));
const entries: SanctionsEntry[] = SanctionsEntrySchema.array().parse(
  await readData("reference/sanctions-sample.json"),
);

const signals: Signal[] = [
  ...countryRiskSignals(baseline, asOf),
  ...screenEntity(baseline, entries, asOf),
];
signals.sort((a, b) => b.date.localeCompare(a.date));

const out = await writeData(`signals/${entityId}.screen.json`, signals);

const byAxis = signals.reduce<Record<string, number>>((acc, s) => {
  acc[s.axis] = (acc[s.axis] ?? 0) + 1;
  return acc;
}, {});
console.log(`Screened "${entityId}" → ${signals.length} signals → ${out}`);
console.log("By axis:", byAxis);
