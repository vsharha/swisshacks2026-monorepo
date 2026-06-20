import {
  treasuryEventToSignals,
  walletScreeningToSignals,
  TreasuryEventSchema,
  WalletScreeningSchema,
} from "@kyc/core/connectors";
import { type Signal } from "@kyc/core";
import { readData, writeData } from "../lib/repo.ts";

/**
 * Blockchain/crypto extract (proposal 14): run the deterministic wallet-screening
 * + on-chain treasury transforms over the bundled sample fixture and write the
 * resulting Signals to data/signals/<entityId>.chain.json, where the live app
 * loads them like any source. The live provider fetch is a documented scaffold;
 * this demonstrates crypto exposure enriching the existing axes end-to-end.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/extract/chain.ts [asOf]
 */

const asOf = process.argv[2] ?? "2026-06-20";

const fixture = await readData<{ treasury?: unknown[]; wallets?: unknown[] }>(
  "reference/chain-sample.json",
);
const treasury = TreasuryEventSchema.array().parse(fixture.treasury ?? []);
const wallets = WalletScreeningSchema.array().parse(fixture.wallets ?? []);

const byEntity = new Map<string, Signal[]>();
const add = (signals: Signal[]) => {
  for (const s of signals) {
    if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
    byEntity.get(s.entityId)!.push(s);
  }
};

for (const event of treasury) add(treasuryEventToSignals(event));
for (const screening of wallets) add(walletScreeningToSignals(screening, asOf));

let total = 0;
for (const [entityId, signals] of [...byEntity.entries()].sort()) {
  signals.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const out = await writeData(`signals/${entityId}.chain.json`, signals);
  total += signals.length;
  console.log(`${entityId}: ${signals.length} chain signal(s) → ${out}`);
  for (const s of signals) console.log(`  • [${s.axis}/${s.type}] ${s.title} (${s.confidence.toFixed(2)})`);
}
console.log(`\n${total} chain signal(s) across ${byEntity.size} entit(y/ies).`);
