import type {
  DriftAxis,
  PatternArchetype,
  PatternMatch,
} from "../schemas/index.ts";

export interface SelectedPatternMatch {
  archetype: PatternArchetype;
  similarity: number;
  source: "stage3" | "axis";
}

function axisSimilarity(alertingAxes: DriftAxis[], archetypeAxes: DriftAxis[]): number {
  if (alertingAxes.length === 0) return 0;
  const archetypeSet = new Set(archetypeAxes);
  const overlap = alertingAxes.filter((axis) => archetypeSet.has(axis)).length;
  const union = new Set([...alertingAxes, ...archetypeAxes]).size;
  return overlap / union;
}

export function selectPatternMatch(
  archetypes: PatternArchetype[],
  alertingAxes: DriftAxis[],
  captured?: PatternMatch,
): SelectedPatternMatch | undefined {
  if (captured) {
    const archetype = archetypes.find((candidate) => candidate.id === captured.archetypeId);
    if (archetype) {
      return { archetype, similarity: captured.similarity, source: "stage3" };
    }
  }

  let best: SelectedPatternMatch | undefined;
  for (const archetype of archetypes) {
    const similarity = axisSimilarity(alertingAxes, archetype.axes);
    if (!best || similarity > best.similarity) {
      best = { archetype, similarity, source: "axis" };
    }
  }
  return best;
}
