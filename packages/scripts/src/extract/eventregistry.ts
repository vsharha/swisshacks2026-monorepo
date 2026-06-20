import {
  articlesToSignals,
  dedupeByEvent,
  fetchArticlesWindowed,
  suggestConcept,
} from "@kyc/core/connectors";
import { loadRootEnv, readData, writeData } from "../lib/repo.ts";

/**
 * Mode 1 offline extractor: pull EventRegistry news for a hero entity over the
 * scenario window, normalize to validated Signals, and write a versioned
 * snapshot into data/signals/. The name + concept URI are read from the entity's
 * baseline; pass an entityId as the first arg (defaults to "smartbird").
 * Run with `pnpm --filter @kyc/scripts exec tsx src/extract/eventregistry.ts <entityId>`.
 */

loadRootEnv();

const apiKey = process.env.EVENTREGISTRY_API_KEY;
if (!apiKey) {
  console.error("Missing EVENTREGISTRY_API_KEY (set it in the repo-root .env).");
  process.exit(1);
}

// Hero entity config (name + concept URI) comes from its baseline. Override the
// concept URI via ER_CONCEPT_URI if entity resolution picks the wrong concept.
const entityId = process.argv[2] ?? "smartbird";
const baseline = await readData<{ conceptUri?: string; name: string }>(
  `baselines/${entityId}.json`,
);
const name = baseline.name;
// NOTE: this EventRegistry key only serves ~the last 30 days of news (older
// windows return 0). EventRegistry therefore supplies recent adverse-media
// texture; the historical structural spine (2024 delisting, Apr-2026 financing)
// comes from the SEC EDGAR and Wayback connectors. Window densely over the
// available range so we don't miss recent events to the 100-article cap.
const dateStart = "2026-05-01";
const dateEnd = "2026-06-20";

const conceptUri =
  process.env.ER_CONCEPT_URI ?? baseline.conceptUri ?? (await suggestConcept(apiKey, name));
if (!conceptUri) {
  console.error(`Could not resolve an EventRegistry concept URI for "${name}".`);
  process.exit(1);
}
console.log(`Entity "${entityId}" → concept ${conceptUri}`);

// Window the full scenario range so older structural events are captured, not
// just the most recent news.
const articles = await fetchArticlesWindowed({
  apiKey,
  conceptUri,
  dateStart,
  dateEnd,
  windowDays: 7,
  count: 100,
});

const { signals: rawSignals, dropped } = articlesToSignals(articles, entityId);
const { signals, rawCount } = dedupeByEvent(rawSignals);
// Newest-first for the timeline / dashboard.
signals.sort((a, b) => b.date.localeCompare(a.date));

const out = await writeData(`signals/${entityId}.eventregistry.json`, signals);

const byAxis = signals.reduce<Record<string, number>>((acc, s) => {
  acc[s.axis] = (acc[s.axis] ?? 0) + 1;
  return acc;
}, {});

console.log(
  `Funnel: ${articles.length} articles → ${rawCount} signals (${dropped} dropped) → ${signals.length} events`,
);
console.log(`Range: ${signals.at(-1)?.date} → ${signals.at(0)?.date}`);
console.log(`Wrote ${signals.length} clustered signals → ${out}`);
console.log("By axis:", byAxis);
