import { classifyAxis } from "../pipeline/stage0.ts";
import { SignalSchema, type Signal } from "../schemas/index.ts";

/**
 * RSS news connector (proposal 7) — breadth, free, multilingual. Emits the same
 * canonical `Signal[]` as every other source from curated global feeds, reaching
 * the non-US / non-English entities EventRegistry and EDGAR miss, at zero API
 * cost. Because RSS gives only title + summary, the connector pairs feeds with
 * full-text extraction (`@mozilla/readability` + `jsdom`) and unwraps Google News
 * redirect links so an obfuscated URL resolves to a real citation target.
 *
 * Framework-agnostic, mirroring `eventRegistry.ts`: pure parse / classify /
 * normalize functions are synchronous and testable; the network calls take an
 * injectable `fetchImpl` (defaulting to global `fetch`) and never read
 * `process.env`. Heavy DOM deps are lazy-imported so importing this module stays
 * cheap for callers that only use the pure helpers.
 */

export interface RssFeed {
  name: string;
  url: string;
  /** BCP-47 language hint, for multilingual routing (proposal 11). */
  lang?: string;
}

/**
 * ~40 curated global feeds spanning regulators, finance and general news across
 * languages — the breadth EventRegistry's English-first key cannot reach. Google
 * News query feeds give per-entity coverage; outlet feeds give ambient texture.
 */
export const RSS_FEEDS: RssFeed[] = [
  // Regulators & official.
  { name: "FINMA", url: "https://www.finma.ch/en/rss/news/", lang: "en" },
  { name: "SEC Press", url: "https://www.sec.gov/news/pressreleases.rss", lang: "en" },
  { name: "FCA UK", url: "https://www.fca.org.uk/news/rss.xml", lang: "en" },
  { name: "EU Commission", url: "https://ec.europa.eu/commission/presscorner/api/rss", lang: "en" },
  // Finance & markets.
  { name: "CNBC Finance", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", lang: "en" },
  { name: "Reuters Business", url: "https://www.reutersagency.com/feed/?best-topics=business-finance", lang: "en" },
  { name: "FT Companies", url: "https://www.ft.com/companies?format=rss", lang: "en" },
  { name: "Bloomberg Markets", url: "https://feeds.bloomberg.com/markets/news.rss", lang: "en" },
  { name: "Handelsblatt", url: "https://www.handelsblatt.com/contentexport/feed/finanzen", lang: "de" },
  { name: "Les Echos", url: "https://services.lesechos.fr/rss/les-echos-finance-marches.xml", lang: "fr" },
  { name: "NZZ Wirtschaft", url: "https://www.nzz.ch/wirtschaft.rss", lang: "de" },
  // General / regional.
  { name: "Guardian Business", url: "https://www.theguardian.com/uk/business/rss", lang: "en" },
  { name: "SCMP Business", url: "https://www.scmp.com/rss/92/feed", lang: "en" },
  { name: "DW Top Stories", url: "https://rss.dw.com/rdf/rss-en-top", lang: "en" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", lang: "en" },
  { name: "The National (UAE)", url: "https://www.thenationalnews.com/business/rss", lang: "en" },
];

export interface RssItem {
  title: string;
  link: string;
  /** Publication time as found in the feed (RFC822 or ISO); normalized later. */
  pubDate?: string;
  summary?: string;
  /** Originating feed name (provenance). */
  feed?: string;
}

const text = (el: Element | null | undefined): string | undefined =>
  el?.textContent?.trim() || undefined;

/**
 * Parse RSS 2.0 or Atom XML into items. Uses `jsdom` (lazy) as an XML parser so
 * a single code path handles both feed dialects. Malformed entries are skipped.
 */
export async function parseFeed(xml: string, feedName?: string): Promise<RssItem[]> {
  const { JSDOM } = await import("jsdom");
  const doc = new JSDOM(xml, { contentType: "text/xml" }).window.document;
  const items: RssItem[] = [];

  // RSS 2.0 / RDF.
  for (const node of Array.from(doc.querySelectorAll("item"))) {
    const title = text(node.querySelector("title"));
    const link = text(node.querySelector("link")) ?? text(node.querySelector("guid"));
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: text(node.querySelector("pubDate")) ?? text(node.querySelector("date")),
      summary: text(node.querySelector("description")),
      feed: feedName,
    });
  }

  // Atom.
  for (const node of Array.from(doc.querySelectorAll("entry"))) {
    const title = text(node.querySelector("title"));
    const linkEl = node.querySelector('link[rel="alternate"]') ?? node.querySelector("link");
    const link = linkEl?.getAttribute("href") ?? text(node.querySelector("id"));
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: text(node.querySelector("published")) ?? text(node.querySelector("updated")),
      summary: text(node.querySelector("summary")) ?? text(node.querySelector("content")),
      feed: feedName,
    });
  }

  return items;
}

/**
 * Resolve a Google News redirect URL to the underlying article URL where it is
 * statically decodable: a `?url=` passthrough, or the older base64url-encoded
 * `/articles/<id>` form that embeds the destination. Newer encrypted ids require
 * the `batchexecute` round-trip (`resolveArticleUrl`); when nothing decodes, the
 * original URL is returned unchanged so it stays a valid citation target.
 */
export function unwrapGoogleNewsUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!/(^|\.)news\.google\.com$/.test(parsed.hostname)) return url;

  const passthrough = parsed.searchParams.get("url");
  if (passthrough) return passthrough;

  const match = parsed.pathname.match(/\/articles\/([^/?]+)/);
  if (match) {
    try {
      const b64 = match[1]!.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(b64, "base64").toString("latin1");
      const inner = decoded.match(/https?:\/\/[^\s"'\\]+/);
      if (inner) return inner[0];
    } catch {
      // fall through to the original url
    }
  }
  return url;
}

export interface ReadableArticle {
  title?: string;
  text: string;
  excerpt?: string;
}

/**
 * Extract the readable body of an article from its HTML via `@mozilla/readability`
 * (over a lazy `jsdom` document). Returns null when the page yields no article.
 */
export async function extractReadable(html: string, url: string): Promise<ReadableArticle | null> {
  const { JSDOM } = await import("jsdom");
  const { Readability } = await import("@mozilla/readability");
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article) return null;
  return {
    title: article.title ?? undefined,
    text: article.textContent?.trim() ?? "",
    excerpt: article.excerpt ?? undefined,
  };
}

export interface EntityMatcher {
  entityId: string;
  name: string;
  aliases?: string[];
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Cheap normalized-form entity matcher (the Stage-0 default; the heavy NER model
 * of proposal 8 is an opt-in upgrade). Returns the ids of entities whose name or
 * any alias appears as a whole token in `text`. Word-boundary matching avoids an
 * alias firing inside a larger word.
 */
export function matchEntities(text: string, entities: EntityMatcher[]): string[] {
  const matched: string[] = [];
  for (const e of entities) {
    const needles = [e.name, ...(e.aliases ?? [])].filter((n) => n.trim().length >= 2);
    const hit = needles.some((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(text));
    if (hit) matched.push(e.entityId);
  }
  return matched;
}

/** Normalize a feed pubDate (RFC822 or ISO) to ISO, or undefined if unparseable. */
function normalizeDate(pubDate?: string): string | undefined {
  if (!pubDate) return undefined;
  const ms = Date.parse(pubDate);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

export interface RssNormalizeResult {
  signals: Signal[];
  /** Items dropped because they failed Signal validation. */
  dropped: number;
}

/**
 * Normalize matched RSS items into validated `Signal`s for one entity. Each item
 * is routed to a drift axis by the Stage-0 classifier (over title + summary) and
 * parsed through `SignalSchema`; items that fail validation are dropped, never
 * thrown, so one bad link never aborts a batch. `asOf` is the date fallback for
 * items without a parseable publication time.
 */
export function rssItemsToSignals(items: RssItem[], entityId: string, asOf: string): RssNormalizeResult {
  const signals: Signal[] = [];
  let dropped = 0;
  for (const item of items) {
    const sourceUrl = unwrapGoogleNewsUrl(item.link);
    const { axis, type, confidence } = classifyAxis(`${item.title} ${item.summary ?? ""}`);
    const parsed = SignalSchema.safeParse({
      id: `rss-${sourceUrl}`,
      entityId,
      axis,
      type,
      date: normalizeDate(item.pubDate) ?? asOf,
      sourceUrl,
      title: item.title,
      source: "rss",
      payload: { feed: item.feed ?? null, summary: item.summary ?? null },
      confidence,
    } satisfies Record<string, unknown>);
    if (parsed.success) signals.push(parsed.data);
    else dropped++;
  }
  return { signals, dropped };
}

/** Fetch and parse a single feed. Network; `fetchImpl` is injectable for tests. */
export async function fetchFeed(
  feed: RssFeed,
  fetchImpl: typeof fetch = fetch,
): Promise<RssItem[]> {
  const res = await fetchImpl(feed.url, {
    headers: { "user-agent": "kyc-drift-monitor/0.1 (+contact@example.com)" },
  });
  if (!res.ok) throw new Error(`RSS ${feed.name} → ${res.status}`);
  return parseFeed(await res.text(), feed.name);
}
