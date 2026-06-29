import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreDriftVector } from "../drift/index.ts";
import {
  AXES,
  KYCBaselineSchema,
  PatternArchetypeSchema,
  SignalArraySchema,
  type KYCBaseline,
  type PatternArchetype,
  type Signal,
} from "../schemas/index.ts";
import { selectPatternMatch } from "./pattern.ts";

const repoRoot = resolve(import.meta.dirname, "../../../..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

function loadPatterns(): PatternArchetype[] {
  return ["long-blockchain-2017", "overstock-blockchain-2018"].map((id) =>
    PatternArchetypeSchema.parse(readJson(`data/pattern-library/${id}.json`)),
  );
}

function loadEntity(entityId: string): { baseline: KYCBaseline; signals: Signal[] } {
  const baseline = KYCBaselineSchema.parse(readJson(`data/baselines/${entityId}.json`));
  const signals = readdirSync(resolve(repoRoot, "data/signals"))
    .filter((file) => file.startsWith(`${entityId}.`))
    .flatMap((file) => SignalArraySchema.parse(readJson(`data/signals/${file}`)));

  return { baseline, signals };
}

function matchAt(
  archetypes: PatternArchetype[],
  baseline: KYCBaseline,
  signals: Signal[],
  asOf: string,
) {
  const drift = scoreDriftVector(baseline, signals, { asOf });
  const axes = AXES.filter((axis) => drift.axes[axis].status !== "stable");
  const evidence = signals.filter((signal) => signal.date <= asOf);

  return {
    drift,
    match: selectPatternMatch(archetypes, axes, evidence),
  };
}

describe("fixture pattern prediction", () => {
  const archetypes = loadPatterns();

  it("predicts Strategy's Overstock pattern from the first financing signal", () => {
    const { baseline, signals } = loadEntity("strategy");
    const { drift, match } = matchAt(archetypes, baseline, signals, "2026-04-15T23:59:59Z");

    expect(drift.status).toBe("watch");
    expect(match?.archetype.id).toBe("overstock-blockchain-2018");
  });

  it("predicts Smartbird's Long Blockchain pattern before the rebrand cluster", () => {
    const { baseline, signals } = loadEntity("smartbird");
    const { drift, match } = matchAt(archetypes, baseline, signals, "2026-05-28T23:59:59Z");

    expect(drift.status).toBe("alert");
    expect(match?.archetype.id).toBe("long-blockchain-2017");
  });

  it("keeps Smartbird on Long Blockchain after the rebrand cluster appears", () => {
    const { baseline, signals } = loadEntity("smartbird");

    for (const asOf of [
      "2026-06-17T23:59:59Z",
      "2026-06-18T23:59:59Z",
      "2026-06-19T23:59:59Z",
    ]) {
      const { match } = matchAt(archetypes, baseline, signals, asOf);
      expect(match?.archetype.id).toBe("long-blockchain-2017");
    }
  });
});
