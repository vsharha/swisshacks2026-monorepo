import {
  KYCBaselineSchema,
  PatternArchetypeSchema,
  SignalArraySchema,
  type PatternArchetype,
  type Signal,
} from "@kyc/core";
import { runEscalation } from "@kyc/core/pipeline";
import { loadRootEnv, readData, writeData } from "./lib/repo.ts";

/**
 * Run the escalation tiers (Stage 2 per-axis reasoning + Stage 3 synthesis) on
 * the hero, the same way the live SvelteKit route does — both call the shared
 * @kyc/core `runEscalation`. Requires ANTHROPIC_API_KEY in the repo-root .env.
 * Writes the alert to data/alerts/. Run with `pnpm --filter @kyc/scripts analyze`.
 */

loadRootEnv();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log(
    "No ANTHROPIC_API_KEY set — the cheap tiers run without it, but Stage 2/3 LLM\n" +
      "reasoning is skipped. Add ANTHROPIC_API_KEY to the repo-root .env to enable it.",
  );
  process.exit(0);
}

const entityId = "smartbird";
const asOf = process.env.AS_OF ?? "2026-06-20T00:00:00Z";

const baseline = KYCBaselineSchema.parse(await readData(`baselines/${entityId}.json`));
const signals: Signal[] = [];
for (const source of ["eventregistry", "sec"]) {
  signals.push(...SignalArraySchema.parse(await readData(`signals/${entityId}.${source}.json`)));
}
const archetypes: PatternArchetype[] = [
  PatternArchetypeSchema.parse(await readData("pattern-library/long-blockchain-2017.json")),
];

const result = await runEscalation({ config: { apiKey }, baseline, signals, archetypes, asOf });

const { drift } = result;
console.log(`Composite ${drift.composite.toFixed(2)} (${drift.status}) as of ${asOf}`);

// Stage 2 — only the axes that actually moved escalate (the cost story).
console.log(`Stage 2 — reasoned ${result.drifting.length} drifting axis/axes...`);
for (const { axis, result: m } of result.stage2) {
  console.log(`  ${axis.padEnd(15)} ${m.verdict} (${m.score.toFixed(2)}) — ${m.reasoning}`);
}

// Stage 3 — only fires when the composite crosses into alert.
if (!result.stage3) {
  console.log("Composite below alert threshold — Stage 3 synthesis not triggered.");
  process.exit(0);
}

console.log("Stage 3 — synthesized RE-KYC alert.");
const { alert } = result.stage3;
const out = await writeData(`alerts/${entityId}.json`, alert);
console.log(`\nRecommended: ${alert.recommendedAction}`);
console.log(`Reasoning:   ${alert.reasoning}`);
if (alert.patternMatch) {
  console.log(
    `Pattern:     matches ${alert.patternMatch.archetypeName} (${(alert.patternMatch.similarity * 100).toFixed(0)}%)`,
  );
}
console.log(`Citations:   ${alert.citations.length}`);
console.log(`Cost:        $${result.cost.usd.toFixed(4)} this run`);
console.log(`Wrote → ${out}`);
