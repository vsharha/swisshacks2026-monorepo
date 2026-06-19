import { extractEntitySignals, suggestConcept } from "@kyc/core/connectors";
import { loadRootEnv, writeData } from "../lib/repo.ts";

/**
 * Mode 1 offline extractor: pull EventRegistry news for the hero entity over
 * the scenario window, normalize to validated Signals, and write a versioned
 * snapshot into data/signals/. Run with `pnpm --filter @kyc/scripts extract:er`.
 */

loadRootEnv();

const apiKey = process.env.EVENTREGISTRY_API_KEY;
if (!apiKey) {
  console.error("Missing EVENTREGISTRY_API_KEY (set it in the repo-root .env).");
  process.exit(1);
}

// Hero entity: Allbirds → NewBird AI → Smartbird. Override the concept URI via
// ER_CONCEPT_URI if entity resolution picks the wrong concept.
const entityId = "smartbird";
const name = "Allbirds";
const dateStart = "2024-01-01";
const dateEnd = "2026-06-20";

const conceptUri = process.env.ER_CONCEPT_URI ?? (await suggestConcept(apiKey, name));
if (!conceptUri) {
  console.error(`Could not resolve an EventRegistry concept URI for "${name}".`);
  process.exit(1);
}
console.log(`Entity "${entityId}" → concept ${conceptUri}`);

const { signals, dropped } = await extractEntitySignals({
  apiKey,
  conceptUri,
  entityId,
  dateStart,
  dateEnd,
  count: 100,
});

const out = await writeData(`signals/${entityId}.json`, signals);

const byAxis = signals.reduce<Record<string, number>>((acc, s) => {
  acc[s.axis] = (acc[s.axis] ?? 0) + 1;
  return acc;
}, {});

console.log(`Wrote ${signals.length} signals (${dropped} dropped) → ${out}`);
console.log("By axis:", byAxis);
