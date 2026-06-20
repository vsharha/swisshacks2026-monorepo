import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  dedupeSignals,
  enforcementToSignals,
  fetchEnforcement,
  SEC_ENFORCEMENT_FEEDS,
  type EntityMatcher,
  type RssItem,
} from "@kyc/core/connectors";
import { advanceState, filterUnseen, isRetryableStatus, mapPool, withRetry } from "@kyc/core/util";
import { KYCBaselineSchema, SignalArraySchema, type Signal } from "@kyc/core";
import { loadRootEnv, readData, repoRoot, writeData } from "../lib/repo.ts";
import { readState, writeState } from "../lib/state.ts";

/**
 * SEC enforcement extract (proposals 11 + 12): pull SEC litigation releases and
 * administrative proceedings, match each respondent against the book by
 * normalized-form name, and write regulator-grade `reputation` Signals to
 * data/signals/<entityId>.sec-enforcement.json. Concurrency + retry/backoff and
 * an incremental watermark, like the RSS extract.
 *
 * Run: pnpm --filter @kyc/scripts exec tsx src/extract/sec-enforcement.ts [asOf]
 */

loadRootEnv();
const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
// SEC mandates a contact User-Agent.
const userAgent =
  process.env.SEC_USER_AGENT ?? "kyc-drift-monitor/0.1 (contact@example.com)";

// Load the book for entity matching.
const baselineDir = join(repoRoot, "data", "baselines");
const files = (await readdir(baselineDir)).filter((f) => f.endsWith(".json"));
const matchers: EntityMatcher[] = [];
for (const f of files) {
  const b = KYCBaselineSchema.parse(await readData(`baselines/${f}`));
  matchers.push({ entityId: b.entityId, name: b.name, aliases: b.aliases });
}

console.log(`Fetching ${SEC_ENFORCEMENT_FEEDS.length} SEC enforcement feeds…`);
const perFeed = await mapPool(
  SEC_ENFORCEMENT_FEEDS,
  async (feed) => {
    try {
      return await withRetry(() => fetchEnforcement(feed, userAgent), {
        retries: 2,
        shouldRetry: (e) => {
          const status = e instanceof Error ? Number(e.message.match(/→ (\d{3})/)?.[1]) : NaN;
          return Number.isNaN(status) || isRetryableStatus(status);
        },
      });
    } catch (e) {
      console.warn(`  ✗ ${feed.name}: ${(e as Error).message}`);
      return [] as RssItem[];
    }
  },
  2,
);
const items = perFeed.flat();
console.log(`Pulled ${items.length} enforcement releases.`);

const { signals: matched, dropped } = enforcementToSignals(items, matchers, asOf);

// Group matched signals by entity.
const byEntity = new Map<string, Signal[]>();
for (const s of matched) {
  if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
  byEntity.get(s.entityId)!.push(s);
}

let totalNew = 0;
for (const [entityId, fresh] of [...byEntity.entries()].sort()) {
  const state = await readState(entityId, "sec-enforcement");
  const unseen = filterUnseen(fresh, state);
  if (unseen.length === 0) continue;

  const rel = `signals/${entityId}.sec-enforcement.json`;
  const existing = existsSync(join(repoRoot, "data", rel))
    ? SignalArraySchema.parse(await readData(rel))
    : [];
  const { signals } = dedupeSignals([...existing, ...unseen]);
  signals.sort((a: Signal, b: Signal) => b.date.localeCompare(a.date));
  const out = await writeData(rel, signals);

  await writeState(entityId, "sec-enforcement", advanceState(state, unseen));
  totalNew += unseen.length;
  console.log(`${entityId}: +${unseen.length} enforcement signal(s) → ${out}`);
}

console.log(
  `\nDone: ${totalNew} new enforcement signal(s) across ${byEntity.size} entit(y/ies) (dropped ${dropped}).`,
);
