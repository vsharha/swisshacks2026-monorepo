import { SignalSchema, type Signal, type DriftAxis } from "../schemas/index.ts";
import { isRetryableStatus, withRetry } from "../util/pool.ts";

/**
 * SEC EDGAR connector — the ground-truth structural spine. EDGAR is free and
 * permanent (unlike the EventRegistry archive), so it supplies the historical
 * filings EventRegistry can't reach: rename, asset sale, $50M financing,
 * delisting. 8-K item codes map deterministically to drift axes, making these
 * the highest-confidence signals in the system — a regulator accepts them.
 *
 * Framework-agnostic: takes a userAgent string (SEC mandates a contact UA) and
 * never reads process.env. Output is always validated `Signal[]`.
 */

const BASE = "https://data.sec.gov";

/** Parallel-array filing history as returned by the submissions endpoint. */
interface SubmissionRecent {
  accessionNumber?: string[];
  filingDate?: string[];
  reportDate?: string[];
  form?: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
  items?: string[];
}

interface Submissions {
  cik?: string;
  name?: string;
  filings?: { recent?: SubmissionRecent };
}

interface FilingClassification {
  axis: DriftAxis;
  type: string;
  confidence: number;
}

/**
 * 8-K item codes → drift axis. Tried in this priority order, so the most
 * structural event on a multi-item filing wins.
 */
const ITEM_MAP: ReadonlyArray<readonly [string, FilingClassification]> = [
  ["5.03", { axis: "business_model", type: "name_or_charter_change", confidence: 0.95 }],
  ["2.01", { axis: "business_model", type: "asset_disposition", confidence: 0.9 }],
  ["1.01", { axis: "scale", type: "material_agreement", confidence: 0.9 }],
  ["3.02", { axis: "scale", type: "equity_sale", confidence: 0.9 }],
  ["1.02", { axis: "scale", type: "agreement_termination", confidence: 0.85 }],
  ["5.01", { axis: "ownership", type: "control_change", confidence: 0.9 }],
  ["5.02", { axis: "ownership", type: "leadership_change", confidence: 0.85 }],
];

/** Form-level mapping for non-8-K filings worth surfacing. */
const FORM_MAP: Record<string, FilingClassification> = {
  "25": { axis: "reputation", type: "delisting", confidence: 0.9 },
  "25-NSE": { axis: "reputation", type: "delisting", confidence: 0.9 },
  "SC 13D": { axis: "ownership", type: "beneficial_ownership", confidence: 0.8 },
  "SC 13G": { axis: "ownership", type: "beneficial_ownership", confidence: 0.7 },
  "DEF 14A": { axis: "ownership", type: "proxy_statement", confidence: 0.5 },
  "S-1": { axis: "scale", type: "securities_registration", confidence: 0.6 },
  "10-K": { axis: "scale", type: "annual_report", confidence: 0.5 },
  "10-Q": { axis: "scale", type: "quarterly_report", confidence: 0.5 },
};

/** Classify a filing to an axis, or null to skip routine/irrelevant forms. */
export function classifyFiling(form: string, items: string): FilingClassification | null {
  if (form === "8-K") {
    const codes = new Set(items.split(/[,\s]+/).filter(Boolean));
    for (const [code, cls] of ITEM_MAP) {
      if (codes.has(code)) return cls;
    }
    // A material current report with no mapped item — still notable, low weight.
    return { axis: "business_model", type: "material_event", confidence: 0.5 };
  }
  return FORM_MAP[form] ?? null;
}

const tenDigitCik = (cik: string): string => cik.replace(/\D/g, "").padStart(10, "0");

/** Build the human-readable filing-index URL (the citation target). */
function filingUrl(cik: string, accessionNumber: string): string {
  const cikInt = String(Number(cik.replace(/\D/g, "")));
  const accNoDashes = accessionNumber.replace(/-/g, "");
  return `${BASE.replace("data.", "www.")}/Archives/edgar/data/${cikInt}/${accNoDashes}/${accessionNumber}-index.htm`;
}

/** Fetch the full submissions history for a CIK. */
export async function fetchSubmissions(cik: string, userAgent: string): Promise<Submissions> {
  // SEC mandates a contact User-Agent and throttles aggressively; retry the
  // transient 429/503 with backoff rather than aborting (proposal 11).
  return withRetry(
    async () => {
      const res = await fetch(`${BASE}/submissions/CIK${tenDigitCik(cik)}.json`, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`SEC EDGAR submissions → ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as Submissions;
    },
    {
      retries: 3,
      shouldRetry: (e) => {
        const status = e instanceof Error ? Number(e.message.match(/→ (\d{3})/)?.[1]) : NaN;
        return Number.isNaN(status) || isRetryableStatus(status);
      },
    },
  );
}

export interface SecNormalizeResult {
  signals: Signal[];
  /** Filings skipped because their form/items didn't classify. */
  skipped: number;
  /** Filings dropped because they failed Signal validation. */
  dropped: number;
}

/**
 * Normalize a submissions history into validated Signals for one entity.
 * Only filings that classify to an axis are emitted (Stage-0 filtering);
 * everything else is skipped.
 */
export function submissionsToSignals(
  submissions: Submissions,
  entityId: string,
  forms?: readonly string[],
): SecNormalizeResult {
  const cik = submissions.cik ?? "";
  const r = submissions.filings?.recent ?? {};
  const n = r.accessionNumber?.length ?? 0;
  const formFilter = forms ? new Set(forms) : null;

  const signals: Signal[] = [];
  let skipped = 0;
  let dropped = 0;

  for (let i = 0; i < n; i++) {
    const form = r.form?.[i] ?? "";
    const accessionNumber = r.accessionNumber?.[i] ?? "";
    const items = r.items?.[i] ?? "";
    if (formFilter && !formFilter.has(form)) {
      skipped++;
      continue;
    }
    const cls = classifyFiling(form, items);
    if (!cls) {
      skipped++;
      continue;
    }
    const description = r.primaryDocDescription?.[i] ?? "";
    const itemPart = form === "8-K" && items ? ` items ${items}` : "";
    const descPart = description && description !== form ? ` — ${description}` : "";
    const parsed = SignalSchema.safeParse({
      id: `sec-${accessionNumber}`,
      entityId,
      axis: cls.axis,
      type: cls.type,
      date: r.filingDate?.[i] ?? r.reportDate?.[i] ?? "",
      sourceUrl: filingUrl(cik, accessionNumber),
      title: `${form}${itemPart}${descPart}`,
      source: "sec_edgar",
      payload: {
        form,
        items: items || null,
        accessionNumber,
        reportDate: r.reportDate?.[i] ?? null,
        primaryDocument: r.primaryDocument?.[i] ?? null,
      },
      confidence: cls.confidence,
    } satisfies Record<string, unknown>);
    if (parsed.success) signals.push(parsed.data);
    else dropped++;
  }
  return { signals, skipped, dropped };
}

export interface SecExtractParams {
  cik: string;
  entityId: string;
  userAgent: string;
  /** Optional whitelist of form types (e.g. ["8-K", "25-NSE"]). */
  forms?: readonly string[];
}

/** Convenience: fetch submissions + normalize in one call. */
export async function extractSecSignals(p: SecExtractParams): Promise<SecNormalizeResult> {
  const submissions = await fetchSubmissions(p.cik, p.userAgent);
  return submissionsToSignals(submissions, p.entityId, p.forms);
}
