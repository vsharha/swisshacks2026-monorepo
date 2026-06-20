import { marketEventToSignals, MarketEventSchema } from "@kyc/core/connectors";
import { type Signal } from "@kyc/core";
import { readData, writeData } from "../lib/repo.ts";

/**
 * Market-intelligence extract (proposal 12 §4): run the deterministic transform
 * over the bundled sample fixture and write structured `scale` Signals to
 * data/signals/<entityId>.market.json, where the live app loads them like any
 * source. The live market feed is a documented scaffold.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/extract/market.ts
 */

const events = MarketEventSchema.array().parse(await readData("reference/market-sample.json"));

const byEntity = new Map<string, Signal[]>();
for (const event of events) {
  for (const s of marketEventToSignals(event)) {
    if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
    byEntity.get(s.entityId)!.push(s);
  }
}

let total = 0;
for (const [entityId, signals] of [...byEntity.entries()].sort()) {
  signals.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const out = await writeData(`signals/${entityId}.market.json`, signals);
  total += signals.length;
  console.log(`${entityId}: ${signals.length} market signal(s) → ${out}`);
}
console.log(`\n${total} market signal(s) across ${byEntity.size} entit(y/ies).`);
