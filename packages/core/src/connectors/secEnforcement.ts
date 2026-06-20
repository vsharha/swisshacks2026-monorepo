import { matchEntities, parseFeed, type EntityMatcher, type RssFeed, type RssItem } from "./rss.ts";
import { SignalSchema, type Signal } from "../schemas/index.ts";

/**
 * SEC enforcement connector — litigation releases and administrative proceedings.
 * Distinct from `secEdgar.ts` (per-CIK *filings*): these are SEC *enforcement
 * actions* published as cross-entity RSS feeds, where each item's title names the
 * respondent. They are regulator-grade `reputation` evidence — an SEC charge is
 * ground truth, not adverse-media rumour — so a match emits a high-confidence
 * `reputation` Signal (source `sec_edgar`). Reuses the RSS parser and the
 * normalized-form entity matcher; framework-agnostic (injectable `fetchImpl`,
 * SEC's mandated contact `User-Agent` passed in).
 */

/** SEC enforcement RSS feeds (current /enforcement-litigation/ paths). */
export const SEC_ENFORCEMENT_FEEDS: RssFeed[] = [
  {
    name: "SEC Litigation Releases",
    url: "https://www.sec.gov/enforcement-litigation/litigation-releases/rss",
    lang: "en",
  },
  {
    name: "SEC Administrative Proceedings",
    url: "https://www.sec.gov/enforcement-litigation/administrative-proceedings/rss",
    lang: "en",
  },
];

/** Confidence for an SEC enforcement match — regulator-grade ground truth. */
const ENFORCEMENT_CONFIDENCE = 0.9;

function normalizeDate(pubDate?: string): string | undefined {
  if (!pubDate) return undefined;
  const ms = Date.parse(pubDate);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

export interface EnforcementNormalizeResult {
  signals: Signal[];
  /** Releases that matched a book entity but failed Signal validation. */
  dropped: number;
}

/**
 * Match enforcement releases against the book by respondent name and emit a
 * `reputation` `enforcement_action` Signal per (release, matched entity). The
 * item title is the respondent, so the normalized-form matcher routes it; an
 * unmatched release is simply ignored. `asOf` is the date fallback.
 */
export function enforcementToSignals(
  items: RssItem[],
  matchers: EntityMatcher[],
  asOf: string,
): EnforcementNormalizeResult {
  const signals: Signal[] = [];
  let dropped = 0;
  for (const item of items) {
    const matched = matchEntities(`${item.title} ${item.summary ?? ""}`, matchers);
    for (const entityId of matched) {
      const parsed = SignalSchema.safeParse({
        id: `sec-enf-${entityId}-${item.link}`,
        entityId,
        axis: "reputation",
        type: "enforcement_action",
        date: normalizeDate(item.pubDate) ?? asOf,
        sourceUrl: item.link,
        title: `SEC enforcement: ${item.title}`,
        source: "sec_edgar",
        payload: { feed: item.feed ?? null, respondent: item.title },
        confidence: ENFORCEMENT_CONFIDENCE,
      } satisfies Record<string, unknown>);
      if (parsed.success) signals.push(parsed.data);
      else dropped++;
    }
  }
  return { signals, dropped };
}

/** Fetch and parse a single SEC enforcement feed. Network; SEC requires a UA. */
export async function fetchEnforcement(
  feed: RssFeed,
  userAgent: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RssItem[]> {
  const res = await fetchImpl(feed.url, {
    headers: { "User-Agent": userAgent, Accept: "application/rss+xml, application/xml" },
  });
  if (!res.ok) throw new Error(`SEC enforcement ${feed.name} → ${res.status}`);
  return parseFeed(await res.text(), feed.name);
}
