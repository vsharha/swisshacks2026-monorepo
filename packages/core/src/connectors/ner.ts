import { matchEntities, type EntityMatcher } from "./rss.ts";

/**
 * Cheap-local-NER seam (proposal 8). Entity resolution on free text (RSS entries
 * have no `conceptUri`) defaults to the normalized-form `matchEntities`. A heavier
 * NER pass — a GLiNER `company` model — is an **opt-in upgrade**, not a default:
 * its cost is **infra, not tokens** (~1.5 GB lazy-loaded model, cold-start
 * latency), so it is injected through this interface rather than bundled. With no
 * matcher supplied, resolution is byte-for-byte the cheap path, so CI and the demo
 * never require the download.
 */
export interface NerMatcher {
  /** Detect company-name spans in free text (e.g. a GLiNER `company` pass). */
  detect(text: string): Promise<string[]>;
}

export interface ResolveEntitiesOptions {
  /** Optional NER matcher; when absent, only the normalized-form scan runs. */
  ner?: NerMatcher;
}

/**
 * Resolve the book entities mentioned in `text` to their ids. Always runs the
 * cheap normalized-form scan; when a `ner` matcher is supplied, its detected
 * company spans are *also* matched against the book (broadening recall for
 * mentions the literal scan misses), and the two id sets are unioned.
 */
export async function resolveEntities(
  text: string,
  matchers: EntityMatcher[],
  options: ResolveEntitiesOptions = {},
): Promise<string[]> {
  const ids = new Set(matchEntities(text, matchers));
  if (options.ner) {
    const detected = await options.ner.detect(text);
    for (const name of detected) {
      for (const id of matchEntities(name, matchers)) ids.add(id);
    }
  }
  return [...ids];
}
