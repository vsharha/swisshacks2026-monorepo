import { AXES, KYCBaselineSchema, SignalArraySchema, type Signal } from "@kyc/core";
import { scoreDriftVector } from "@kyc/core/drift";
import { readData, writeData } from "./lib/repo.ts";

/**
 * Compute the current drift vector for the hero from its baseline and the
 * extracted signals (EventRegistry + SEC), and write it to data/drift/. A
 * sanity check for the cheap-tier scorer on real data.
 * Run with `pnpm --filter @kyc/scripts score:drift`.
 */

const entityId = "smartbird";

const baseline = KYCBaselineSchema.parse(await readData(`baselines/${entityId}.json`));

const signals: Signal[] = [];
for (const source of ["eventregistry", "sec"]) {
  const loaded = SignalArraySchema.parse(await readData(`signals/${entityId}.${source}.json`));
  signals.push(...loaded);
}

const asOf = process.env.AS_OF ?? "2026-06-20T00:00:00Z";
const drift = scoreDriftVector(baseline, signals, { asOf });

const out = await writeData(`drift/${entityId}.json`, drift);

console.log(`Drift for "${entityId}" as of ${asOf} (${signals.length} signals)`);
console.log(`Composite: ${drift.composite.toFixed(3)} → ${drift.status.toUpperCase()}`);
for (const axis of AXES) {
  const a = drift.axes[axis];
  const bar = "█".repeat(Math.round(a.score * 10)).padEnd(10, "░");
  console.log(`  ${axis.padEnd(15)} ${bar} ${a.score.toFixed(2)} ${a.status}`);
}
console.log(`Wrote → ${out}`);
