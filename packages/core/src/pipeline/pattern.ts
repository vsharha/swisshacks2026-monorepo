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
const MIN_PATTERN_SCORE = 0.3;
const MIN_OBSERVATION_DAYS = 330;
const PARTIAL_KEYWORD_FLOOR = 0.66;
const PARTIAL_KEYWORD_SCORE = 0.7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const TOKEN_ALIASES: Record<string, string[]> = {
  btc: ["bitcoin"],
  crypto: ["digital", "asset"],
  notes: ["debt"],
  note: ["debt"],
  bonds: ["debt"],
  bond: ["debt"],
  credit: ["debt"],
  shares: ["stock"],
  share: ["stock"],
  equity: ["stock"],
  flying: ["surge", "spike", "pump"],
  flight: ["surge", "spike", "pump"],
  soaring: ["surge", "spike", "pump"],
  soars: ["surge", "spike", "pump"],
  skyrockets: ["surge", "spike", "pump"],
  skyrocketing: ["surge", "spike", "pump"],
  jumps: ["surge", "spike", "pump"],
  jumped: ["surge", "spike", "pump"],
};

function axisSimilarity(alertingAxes: DriftAxis[], archetypeAxes: DriftAxis[]): number {
  if (alertingAxes.length === 0) return 0;
  const archetypeSet = new Set(archetypeAxes);
  const overlap = alertingAxes.filter((axis) => archetypeSet.has(axis)).length;
  const union = new Set([...alertingAxes, ...archetypeAxes]).size;
  return overlap / union;
}

function tokens(value: string): string[] {
  const normalized = value.toLowerCase().replace(/\ba\s*\.?\s*i\.?\b/g, "ai");
  const split = normalized
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const compacted =
    normalized.match(/[a-z0-9]+(?:[-_.][a-z0-9]+)+/g)?.map((token) =>
      token.replace(/[^a-z0-9]/g, ""),
    ) ?? [];

  return [...split, ...compacted];
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

function inferredConceptText(signal: Signal): string {
  const text = signalText(signal);
  const lower = text.toLowerCase();
  const concepts: string[] = [];
  const payloadItems = typeof signal.payload.items === "string" ? signal.payload.items : "";
  const secItems = new Set(payloadItems.split(/[,\s]+/).filter(Boolean));

  if (signal.type === "name_or_charter_change" || secItems.has("5.03")) {
    concepts.push("rename rebrand");
  }

  if (
    signal.type === "material_agreement" &&
    (secItems.has("2.03") || secItems.has("3.02"))
  ) {
    concepts.push("convertible debt leverage");
  }

  if (signal.type === "equity_sale") {
    concepts.push("convertible debt leverage");
  }

  if (
    /valuation_change|hiring_freeze|headcount_drop|margin pressure|restructur|collapse|near-zero|\bdown\b|plunge|pressure/.test(
      lower,
    )
  ) {
    concepts.push("struggling brand");
  }

  if (/convertible (notes?|bonds?)/.test(lower)) {
    concepts.push("convertible debt");
  }

  if (
    /(digital[-\s]?asset|crypto|bitcoin|btc).{0,80}(purchase|buy|accumul|reserve|treasury|holding)/.test(
      lower,
    ) ||
    /(purchase|buy|accumul|reserve|treasury|holding).{0,80}(digital[-\s]?asset|crypto|bitcoin|btc)/.test(
      lower,
    )
  ) {
    concepts.push("digital asset treasury crypto treasury");
  }

  if (
    /(shares?|stock).{0,60}(flying|soar|surge|skyrocket|jump|pump|spike)/.test(lower) ||
    /(flying|soar|surge|skyrocket|jump|pump|spike).{0,60}(shares?|stock)/.test(lower)
  ) {
    concepts.push("stock pump stock surge spike");
  }

  if (/re[-\s]?brand|rename|name change/.test(lower)) {
    concepts.push("rename rebrand");
  }

  if (/\bai\b.{0,50}(pivot|shift|infrastructure|company)/.test(lower)) {
    concepts.push("ai pivot buzzword");
  }

  return [text, ...concepts].join(" ");
}

function tokenForms(token: string): Set<string> {
  const forms = new Set([token]);
  if (token.length > 4 && token.endsWith("ies")) forms.add(`${token.slice(0, -3)}y`);
  if (token.length > 4 && token.endsWith("ing")) forms.add(token.slice(0, -3));
  if (token.length > 4 && token.endsWith("ed")) forms.add(token.slice(0, -2));
  if (token.length > 4 && token.endsWith("es")) forms.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s")) forms.add(token.slice(0, -1));

  for (const form of [...forms]) {
    for (const alias of TOKEN_ALIASES[form] ?? []) forms.add(alias);
  }

  return forms;
}

function tokenMatches(haystackToken: string, keywordToken: string): boolean {
  const haystackForms = tokenForms(haystackToken);
  const keywordForms = tokenForms(keywordToken);

  for (const expected of keywordForms) {
    for (const actual of haystackForms) {
      if (expected.length <= 2 ? actual === expected : actual === expected || actual.startsWith(expected)) {
        return true;
      }
    }
  }

  return false;
}

function keywordScore(haystackTokens: string[], keyword: string): number {
  const keywordTokens = tokens(keyword);
  if (keywordTokens.length === 0) return 0;

  const matched = keywordTokens.filter((keywordToken) =>
    haystackTokens.some((haystackToken) => tokenMatches(haystackToken, keywordToken)),
  ).length;
  if (matched === keywordTokens.length) return 1;

  const coverage = matched / keywordTokens.length;
  return keywordTokens.length >= 3 && coverage >= PARTIAL_KEYWORD_FLOOR
    ? PARTIAL_KEYWORD_SCORE
    : 0;
}

function matchedKeywords(signal: Signal, archetype: PatternArchetype): Array<[string, number]> {
  if (archetype.keywords.length === 0) return [];
  const haystackTokens = tokens(inferredConceptText(signal));
  return archetype.keywords
    .map((keyword) => [keyword, keywordScore(haystackTokens, keyword)] as [string, number])
    .filter(([, score]) => score > 0);
}

function keywordEvidence(signals: Signal[], archetype: PatternArchetype): {
  axes: DriftAxis[];
  similarity: number;
} {
  if (archetype.keywords.length === 0 || signals.length === 0) {
    return { axes: [], similarity: 0 };
  }

  const hits = new Map<string, number>();
  const axes = new Set<DriftAxis>();
  for (const signal of signals) {
    const signalHits = matchedKeywords(signal, archetype);
    if (signalHits.length === 0) continue;
    axes.add(signal.axis);
    for (const [hit, score] of signalHits) {
      hits.set(hit, Math.max(hits.get(hit) ?? 0, score));
    }
  }

  const score = [...hits.values()].reduce((sum, hitScore) => sum + hitScore, 0);
  return {
    axes: [...axes],
    similarity: Math.min(1, score / Math.min(KEYWORD_TARGET, archetype.keywords.length)),
  };
}

function uniqueAxes(axes: DriftAxis[]): DriftAxis[] {
  return [...new Set(axes)];
}

function observationDays(signals: Signal[]): number {
  const times = signals.map((signal) => Date.parse(signal.date)).filter(Number.isFinite);
  if (times.length === 0) return 0;
  return (Math.max(...times) - Math.min(...times)) / MS_PER_DAY;
}

export function selectPatternMatch(
  archetypes: PatternArchetype[],
  alertingAxes: DriftAxis[],
  signals: Signal[],
): SelectedPatternMatch | undefined {
  if (signals.length === 0) return undefined;
  if (observationDays(signals) < MIN_OBSERVATION_DAYS) return undefined;

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
