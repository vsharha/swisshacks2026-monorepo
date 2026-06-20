import { createHash } from "node:crypto";
import { type Signal } from "../schemas/index.ts";

export interface DedupeResult {
  signals: Signal[];
  /** How many raw signals went in (before clustering). */
  rawCount: number;
}

/** Normalised text fingerprint: lowercased, punctuation-stripped, first ~1k chars. */
export function fingerprint(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
  return createHash("md5").update(normalized).digest("hex");
}

/**
 * Collapse signals describing the same underlying event into one — generalising
 * the EventRegistry-only `dedupeByEvent` to cluster ACROSS sources (proposal 9).
 * Two signals join the same cluster if they share ANY of: `eventUri`,
 * `sourceUrl`, or a normalised title fingerprint — so an 8-K and the article
 * reporting the same event collapse. Keeps the highest-confidence signal as the
 * representative (ties broken by earliest date) and records `clusterSize` on it.
 *
 * Caveat: signals carry only a `title` (not full body), so the fingerprint
 * clusters near-identical headlines; events reported under very different
 * headlines still rely on `eventUri`/`sourceUrl`.
 */
export function dedupeSignals(signals: Signal[]): DedupeResult {
  const n = signals.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const keyOwner = new Map<string, number>();
  signals.forEach((s, i) => {
    const keys: string[] = [];
    const eventUri = s.payload.eventUri as string | null | undefined;
    if (eventUri) keys.push(`event:${eventUri}`);
    keys.push(`url:${s.sourceUrl}`, `fp:${fingerprint(s.title)}`);
    for (const k of keys) {
      const owner = keyOwner.get(k);
      if (owner === undefined) keyOwner.set(k, i);
      else union(i, owner);
    }
  });

  const groups = new Map<number, Signal[]>();
  signals.forEach((s, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(s);
    else groups.set(root, [s]);
  });

  const out: Signal[] = [...groups.values()].map((group) => {
    const rep = [...group].sort(
      (a, b) => b.confidence - a.confidence || a.date.localeCompare(b.date),
    )[0]!;
    return { ...rep, payload: { ...rep.payload, clusterSize: group.length } };
  });

  return { signals: out, rawCount: n };
}
