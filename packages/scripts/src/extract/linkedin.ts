import { hiringEventToSignals, HiringEventSchema } from "@kyc/core/connectors";
import { type Signal } from "@kyc/core";
import { readData, writeData } from "../lib/repo.ts";

/**
 * Hiring-trends extract: run the deterministic transform over the bundled sample
 * fixture and write `scale` / `business_model` Signals to
 * data/signals/<entityId>.linkedin.json, where the live app loads them like any
 * source. The live hiring feed is a documented scaffold.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/extract/linkedin.ts
 */

const events = HiringEventSchema.array().parse(await readData("reference/hiring-sample.json"));

const byEntity = new Map<string, Signal[]>();
for (const event of events) {
  for (const s of hiringEventToSignals(event)) {
    if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
    byEntity.get(s.entityId)!.push(s);
  }
}

let total = 0;
for (const [entityId, signals] of [...byEntity.entries()].sort()) {
  signals.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const out = await writeData(`signals/${entityId}.linkedin.json`, signals);
  total += signals.length;
  console.log(`${entityId}: ${signals.length} hiring signal(s) → ${out}`);
}
console.log(`\n${total} hiring signal(s) across ${byEntity.size} entit(y/ies).`);
