import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  KYCBaselineSchema,
  PatternArchetypeSchema,
  SignalArraySchema,
  type PatternArchetype,
  type Signal,
} from "@kyc/core";
import { runEscalation } from "@kyc/core/pipeline";
import { loadRootEnv, readData, repoRoot, writeData } from "./lib/repo.ts";

/**
 * Capture deterministic Stage 2/3 fixtures for the demo heroes so the deployed
 * SvelteKit app can replay them without any live LLM call. Mirrors the live
 * route's `analyzeEntity` exactly — loads every signal source for the entity and
 * the whole pattern library, runs the shared `runEscalation`, and writes the
 * full EscalationResult to data/analysis/<entity>.json. Run once, offline, with
 * LLM_API_KEY set (Apertus over Public AI is free): `ENTITY=strategy pnpm
 * --filter @kyc/scripts capture` (defaults to both heroes).
 */

loadRootEnv();

const apiKey = process.env.LLM_API_KEY;
if (!apiKey) {
  console.error("No LLM_API_KEY in the repo-root .env — cannot capture fixtures.");
  process.exit(1);
}

const config = {
  apiKey,
  baseURL: process.env.LLM_BASE_URL || undefined,
  stage2Model: process.env.LLM_STAGE2_MODEL || undefined,
  stage3Model: process.env.LLM_STAGE3_MODEL || undefined,
};

const asOf = process.env.AS_OF ?? "2026-06-20T00:00:00Z";
const heroes = process.env.ENTITY ? [process.env.ENTITY] : ["smartbird", "strategy"];

// Whole pattern library, like the live route (loadPatternLibrary).
const patternDir = join(repoRoot, "data", "pattern-library");
const archetypes: PatternArchetype[] = [];
for (const file of readdirSync(patternDir)) {
  if (file.endsWith(".json")) {
    archetypes.push(PatternArchetypeSchema.parse(await readData(`pattern-library/${file}`)));
  }
}

const signalDir = join(repoRoot, "data", "signals");

for (const entityId of heroes) {
  const baseline = KYCBaselineSchema.parse(await readData(`baselines/${entityId}.json`));

  // Every signal source for this entity (eventregistry, sec, market, …) — the
  // live route merges them all.
  const signals: Signal[] = [];
  const prefix = `${entityId}.`;
  for (const file of readdirSync(signalDir)) {
    if (file.startsWith(prefix) && file.endsWith(".json")) {
      signals.push(...SignalArraySchema.parse(await readData(`signals/${file}`)));
    }
  }

  const result = await runEscalation({
    config,
    baseline,
    signals,
    archetypes,
    asOf,
    alertId: `alert-${entityId}`,
  });

  const out = await writeData(`analysis/${entityId}.json`, result);
  const tier = result.stage3 ? "Stage 3 alert" : "no Stage 3";
  console.log(
    `${entityId}: composite ${result.drift.composite.toFixed(2)} (${result.drift.status}), ` +
      `${result.stage2.length} Stage 2 axis/axes, ${tier} → ${out}`,
  );
}
