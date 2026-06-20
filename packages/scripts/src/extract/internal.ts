import {
  internalRecordsToOutcomes,
  internalRecordsToSignals,
  InternalRecordSchema,
} from "@kyc/core/connectors";
import { historicalAccuracyFromOutcomes } from "@kyc/core/drift";
import { type Signal } from "@kyc/core";
import { readData, writeData } from "../lib/repo.ts";

/**
 * Internal/MCP extract (proposal 13): run the deterministic transform over the
 * bundled sample of the bank's own history and write `reputation`/`ownership`
 * Signals to data/signals/<entityId>.internal.json. Also derives realized
 * outcomes — the raw material for the confidence engine's historical-accuracy
 * term — and reports the per-book accuracy. The live MCP fetch is a scaffold.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/extract/internal.ts
 */

const records = InternalRecordSchema.array().parse(await readData("reference/internal-sample.json"));

const byEntity = new Map<string, Signal[]>();
for (const s of internalRecordsToSignals(records)) {
  if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
  byEntity.get(s.entityId)!.push(s);
}

let total = 0;
for (const [entityId, signals] of [...byEntity.entries()].sort()) {
  signals.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const out = await writeData(`signals/${entityId}.internal.json`, signals);
  total += signals.length;
  console.log(`${entityId}: ${signals.length} internal signal(s) → ${out}`);
}

// The outcome-feedback loop: realized rating changes populate historical accuracy.
const outcomes = internalRecordsToOutcomes(records);
const confirmed = outcomes.filter((o) => o.kind === "outcome" && o.toRating === "high").length;
const accuracy = historicalAccuracyFromOutcomes(confirmed, outcomes.length);
console.log(
  `\n${total} internal signal(s); ${outcomes.length} realized outcome(s) → historical accuracy ${accuracy.toFixed(2)} (feeds confidence engine, proposal 13).`,
);
