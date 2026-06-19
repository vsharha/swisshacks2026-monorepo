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

export interface FetchArticlesWindowedParams extends FetchArticlesParams {
  dateStart: string;
  dateEnd: string;
  /** Window size in days (default 30). Smaller windows = denser timeline coverage. */
  windowDays?: number;
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Split an inclusive [start, end] date range into disjoint day-windows. */
function dateWindows(start: string, end: string, days: number): Array<{ dateStart: string; dateEnd: string }> {
  const windows: Array<{ dateStart: string; dateEnd: string }> = [];
  const final = new Date(`${end}T00:00:00Z`);
  let cursor = new Date(`${start}T00:00:00Z`);
  while (cursor <= final) {
    const winEnd = new Date(cursor);
    winEnd.setUTCDate(winEnd.getUTCDate() + days - 1);
    windows.push({ dateStart: isoDay(cursor), dateEnd: isoDay(winEnd > final ? final : winEnd) });
    cursor = new Date(winEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

/**
 * Fetch articles across the whole date range by querying it in windows. A
 * single sort-by-date call only returns the most recent N; windowing guarantees
 * coverage of older structural events (2024 delisting, Apr-2026 financing).
 * De-duplicates by article URI across windows.
 */
export async function fetchArticlesWindowed(p: FetchArticlesWindowedParams): Promise<ERArticle[]> {
  const windows = dateWindows(p.dateStart, p.dateEnd, p.windowDays ?? 30);
  const seen = new Set<string>();
  const all: ERArticle[] = [];
  for (const w of windows) {
    const arts = await fetchArticles({ ...p, dateStart: w.dateStart, dateEnd: w.dateEnd });
    for (const a of arts) {
      if (!seen.has(a.uri)) {
        seen.add(a.uri);
        all.push(a);
      }
    }
  }
  return all;
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

export interface DedupeResult {
  signals: Signal[];
  /** How many raw signals went in (before clustering). */
  rawCount: number;
}

/**
 * Collapse signals that describe the same underlying event into one — the
 * native EventRegistry cost lever ("one event, not 200 articles"). Clusters by
 * `eventUri` (falling back to source URL), keeps the earliest-dated signal as
 * the representative, and records `clusterSize` in its payload.
 */
export function dedupeByEvent(signals: Signal[]): DedupeResult {
  const byKey = new Map<string, Signal>();
  const sorted = [...signals].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sorted) {
    const key = (s.payload.eventUri as string | null) || s.sourceUrl;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...s, payload: { ...s.payload, clusterSize: 1 } });
    } else {
      existing.payload.clusterSize = (existing.payload.clusterSize as number) + 1;
    }
  }
  return { signals: [...byKey.values()], rawCount: signals.length };
}

export interface ExtractParams extends FetchArticlesParams {
  entityId: string;
}

/** Convenience: fetch + normalize in one call. */
export async function extractEntitySignals(p: ExtractParams): Promise<NormalizeResult> {
  const articles = await fetchArticles(p);
  return articlesToSignals(articles, p.entityId);
}
