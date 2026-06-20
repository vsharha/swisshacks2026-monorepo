import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  dedupeSignals,
  fetchFeed,
  matchEntities,
  rssItemsToSignals,
  RSS_FEEDS,
  type EntityMatcher,
  type RssItem,
} from "@kyc/core/connectors";
import {
  advanceState,
  filterUnseen,
  isRetryableStatus,
  mapPool,
  withRetry,
} from "@kyc/core/util";
import { KYCBaselineSchema, SignalArraySchema, type Signal } from "@kyc/core";
import { readData, repoRoot, writeData } from "../lib/repo.ts";
import { readState, writeState } from "../lib/state.ts";

/**
 * RSS extract (proposals 7 + 10 + 11): pull the curated global feeds with bounded
 * concurrency and retry/backoff, match each item against the book by
 * normalized-form name/alias, normalize matches to canonical `Signal`s, and
 * write data/signals/<entityId>.rss.json. Incremental: a per-entity watermark +
 * seen-set means a re-run only adds genuinely new signals.
 *
 * No API key required (RSS is free). Run:
 *   pnpm --filter @kyc/scripts exec tsx src/extract/rss.ts [asOf]
 */

const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const CONCURRENCY = 6;

// Load the book for entity matching.
const baselineDir = join(repoRoot, "data", "baselines");
const files = (await readdir(baselineDir)).filter((f) => f.endsWith(".json"));
const matchers: EntityMatcher[] = [];
for (const f of files) {
  const b = KYCBaselineSchema.parse(await readData(`baselines/${f}`));
  matchers.push({ entityId: b.entityId, name: b.name, aliases: b.aliases });
}

// Fetch every feed concurrently; a failed feed degrades to [] rather than
// aborting the batch (proposal 11).
console.log(`Fetching ${RSS_FEEDS.length} feeds (concurrency ${CONCURRENCY})…`);
const perFeed = await mapPool(
  RSS_FEEDS,
  async (feed) => {
    try {
      return await withRetry(() => fetchFeed(feed), {
        retries: 2,
        shouldRetry: (e) => {
          // Retry transient HTTP statuses and network errors; not 4xx like 404.
          const status = e instanceof Error ? Number(e.message.match(/→ (\d{3})/)?.[1]) : NaN;
          return Number.isNaN(status) || isRetryableStatus(status);
        },
      });
    } catch (e) {
      console.warn(`  ✗ ${feed.name}: ${(e as Error).message}`);
      return [] as RssItem[];
    }
  },
  CONCURRENCY,
);
const items = perFeed.flat();
console.log(`Pulled ${items.length} items from ${perFeed.filter((p) => p.length > 0).length} live feeds.`);

// Attribute each item to the entities it mentions.
const byEntity = new Map<string, RssItem[]>();
for (const item of items) {
  const text = `${item.title} ${item.summary ?? ""}`;
  for (const entityId of matchEntities(text, matchers)) {
    if (!byEntity.has(entityId)) byEntity.set(entityId, []);
    byEntity.get(entityId)!.push(item);
  }
}

let totalNew = 0;
for (const [entityId, entityItems] of [...byEntity.entries()].sort()) {
  const { signals: fresh, dropped } = rssItemsToSignals(entityItems, entityId, asOf);

  // Incremental: keep only signals not seen in a prior run.
  const state = await readState(entityId, "rss");
  const unseen = filterUnseen(fresh, state);
  if (unseen.length === 0) {
    console.log(`${entityId}: ${fresh.length} matched, 0 new (dropped ${dropped}).`);
    continue;
  }

  // Merge with any existing snapshot, dedup across sources, write.
  const rel = `signals/${entityId}.rss.json`;
  const existing = existsSync(join(repoRoot, "data", rel))
    ? SignalArraySchema.parse(await readData(rel))
    : [];
  const { signals } = dedupeSignals([...existing, ...unseen]);
  signals.sort((a: Signal, b: Signal) => b.date.localeCompare(a.date));
  const out = await writeData(rel, signals);

  await writeState(entityId, "rss", advanceState(state, unseen));
  totalNew += unseen.length;
  console.log(`${entityId}: +${unseen.length} new (dropped ${dropped}) → ${out}`);
}

console.log(`\nDone: ${totalNew} new RSS signal(s) across ${byEntity.size} matched entit(y/ies).`);
