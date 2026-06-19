import { SignalSchema, type Signal } from "../schemas/index.ts";
import { classifyAxis } from "../pipeline/stage0.ts";

/**
 * EventRegistry connector — the workhorse source. Framework-agnostic: it takes
 * an apiKey as a parameter and never reads process.env, so the same functions
 * power both the offline extraction scripts and the live SvelteKit routes
 * ("one connector layer, two callers"). Output is always validated `Signal[]`.
 */

const BASE = "https://eventregistry.org/api/v1";

/** Minimal shape of an EventRegistry article result (we only read what we use). */
interface ERArticle {
  uri: string;
  url: string;
  title: string;
  body?: string;
  date?: string; // "YYYY-MM-DD"
  dateTime?: string; // full ISO
  source?: { title?: string };
  sentiment?: number | null;
  eventUri?: string | null;
}

interface ERArticlesResponse {
  articles?: { results?: ERArticle[]; totalResults?: number; pages?: number };
  error?: string;
}

interface ERConcept {
  uri: string;
  label?: { eng?: string };
  type?: string;
}

export interface FetchArticlesParams {
  apiKey: string;
  /** EventRegistry concept URI, e.g. "http://en.wikipedia.org/wiki/Allbirds". */
  conceptUri: string;
  /** Inclusive date bounds, "YYYY-MM-DD". */
  dateStart?: string;
  dateEnd?: string;
  count?: number;
  lang?: string;
}

async function erPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`EventRegistry ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Resolve a free-text name to its EventRegistry concept URI (entity resolution,
 * Stage 0). Returns the top suggestion, or undefined if none.
 */
export async function suggestConcept(
  apiKey: string,
  prefix: string,
): Promise<string | undefined> {
  const results = await erPost<ERConcept[]>("suggestConceptsFast", {
    prefix,
    lang: "eng",
    source: ["concepts"],
    apiKey,
  });
  return results?.[0]?.uri;
}

/** Fetch raw articles for an entity over a date range. */
export async function fetchArticles(p: FetchArticlesParams): Promise<ERArticle[]> {
  const json = await erPost<ERArticlesResponse>("article/getArticles", {
    action: "getArticles",
    conceptUri: p.conceptUri,
    lang: p.lang ?? "eng",
    dateStart: p.dateStart,
    dateEnd: p.dateEnd,
    articlesSortBy: "date",
    articlesCount: Math.min(p.count ?? 100, 100),
    includeArticleSentiment: true,
    includeArticleEventUri: true,
    resultType: "articles",
    apiKey: p.apiKey,
  });
  if (json.error) throw new Error(`EventRegistry error: ${json.error}`);
  return json.articles?.results ?? [];
}

export interface NormalizeResult {
  signals: Signal[];
  /** Count of raw articles dropped because they failed Signal validation. */
  dropped: number;
}

/**
 * Normalize raw EventRegistry articles into validated Signals for one entity.
 * Each article is routed to a drift axis by the Stage-0 classifier and parsed
 * through `SignalSchema`; articles that fail validation (e.g. a bad URL) are
 * dropped rather than aborting the batch.
 */
export function articlesToSignals(articles: ERArticle[], entityId: string): NormalizeResult {
  const signals: Signal[] = [];
  let dropped = 0;
  for (const a of articles) {
    const { axis, type, confidence } = classifyAxis(`${a.title} ${a.body ?? ""}`);
    const parsed = SignalSchema.safeParse({
      id: `er-${a.uri}`,
      entityId,
      axis,
      type,
      date: a.dateTime ?? a.date ?? new Date().toISOString(),
      sourceUrl: a.url,
      title: a.title,
      source: "eventregistry",
      payload: {
        eventUri: a.eventUri ?? null,
        sentiment: a.sentiment ?? null,
        sourceTitle: a.source?.title ?? null,
      },
      confidence,
    } satisfies Record<string, unknown>);
    if (parsed.success) signals.push(parsed.data);
    else dropped++;
  }
  return { signals, dropped };
}

export interface ExtractParams extends FetchArticlesParams {
  entityId: string;
}

/** Convenience: fetch + normalize in one call. */
export async function extractEntitySignals(p: ExtractParams): Promise<NormalizeResult> {
  const articles = await fetchArticles(p);
  return articlesToSignals(articles, p.entityId);
}
