import type { DriftAxis, PatternArchetype, Signal } from "../schemas/index.ts";

export interface SelectedPatternMatch {
  archetype: PatternArchetype;
  similarity: number;
  axes: DriftAxis[];
  source: "signals";
}

const AXIS_WEIGHT = 0.25;
const KEYWORD_WEIGHT = 0.75;
const KEYWORD_TARGET = 3;
const MIN_PATTERN_SCORE = 0.5;

function axisSimilarity(alertingAxes: DriftAxis[], archetypeAxes: DriftAxis[]): number {
  if (alertingAxes.length === 0) return 0;
  const archetypeSet = new Set(archetypeAxes);
  const overlap = alertingAxes.filter((axis) => archetypeSet.has(axis)).length;
  const union = new Set([...alertingAxes, ...archetypeAxes]).size;
  return overlap / union;
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function signalText(signal: Signal): string {
  return [
    signal.title,
    signal.type,
    signal.marketResearch,
    signal.signalInference,
    JSON.stringify(signal.payload),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasKeyword(haystackTokens: string[], keyword: string): boolean {
  const keywordTokens = tokens(keyword);
  return keywordTokens.every((keywordToken) =>
    haystackTokens.some((haystackToken) =>
      keywordToken.length <= 2
        ? haystackToken === keywordToken
        : haystackToken === keywordToken || haystackToken.startsWith(keywordToken),
    ),
  );
}

function matchedKeywords(signal: Signal, archetype: PatternArchetype): string[] {
  if (archetype.keywords.length === 0) return [];
  const haystackTokens = tokens(signalText(signal));
  return archetype.keywords.filter((keyword) => hasKeyword(haystackTokens, keyword));
}

function keywordEvidence(signals: Signal[], archetype: PatternArchetype): {
  axes: DriftAxis[];
  similarity: number;
} {
  if (archetype.keywords.length === 0 || signals.length === 0) {
    return { axes: [], similarity: 0 };
  }

  const hits = new Set<string>();
  const axes = new Set<DriftAxis>();
  for (const signal of signals) {
    const signalHits = matchedKeywords(signal, archetype);
    if (signalHits.length === 0) continue;
    axes.add(signal.axis);
    for (const hit of signalHits) hits.add(hit);
  }

  return {
    axes: [...axes],
    similarity: Math.min(1, hits.size / Math.min(KEYWORD_TARGET, archetype.keywords.length)),
  };
}

function uniqueAxes(axes: DriftAxis[]): DriftAxis[] {
  return [...new Set(axes)];
}

export function selectPatternMatch(
  archetypes: PatternArchetype[],
  alertingAxes: DriftAxis[],
  signals: Signal[],
): SelectedPatternMatch | undefined {
  if (signals.length === 0) return undefined;

  let best: SelectedPatternMatch | undefined;
  for (const archetype of archetypes) {
    const evidence = keywordEvidence(signals, archetype);
    if (evidence.similarity === 0) continue;

    const candidateAxes = uniqueAxes([...alertingAxes, ...evidence.axes]);
    const axes = axisSimilarity(candidateAxes, archetype.axes);
    const similarity = axes * AXIS_WEIGHT + evidence.similarity * KEYWORD_WEIGHT;
    if (similarity < MIN_PATTERN_SCORE) continue;

    if (!best || similarity > best.similarity) {
      best = {
        archetype,
        similarity,
        axes: candidateAxes.filter((axis) => archetype.axes.includes(axis)),
        source: "signals",
      };
    }
  }
  return best;
}
