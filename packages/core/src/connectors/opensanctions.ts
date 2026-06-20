import { z } from "zod";

/**
 * OpenSanctions connector (proposals 6 + 12). The deterministic `matchSanctions`
 * + a bundled sample fixture do the real work for the demo screen; the live
 * `fetchSanctions` is a documented scaffold — with no API key it returns [] and
 * logs, so nothing fake-passes as a live fetch. Aggregates OFAC / UN / EU / UK
 * HMT once wired.
 */
export const SanctionsEntrySchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  /** Originating list, e.g. "OFAC SDN", "EU", "PEP". */
  list: z.string().min(1),
  type: z.enum(["sanction", "pep"]),
  /** ISO alpha-2, when known. */
  country: z.string().optional(),
  sourceUrl: z.url(),
});
export type SanctionsEntry = z.infer<typeof SanctionsEntrySchema>;

/** Lowercased, whitespace-collapsed name for matching. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Return the first sanctions/PEP entry whose canonical name or any alias matches
 * `name` (normalized), or null. Exact normalized-form match — deliberately
 * conservative (no fuzzy matching) so a hit is defensible.
 */
export function matchSanctions(name: string, entries: SanctionsEntry[]): SanctionsEntry | null {
  const target = normalizeName(name);
  for (const e of entries) {
    if (normalizeName(e.name) === target) return e;
    if (e.aliases.some((a) => normalizeName(a) === target)) return e;
  }
  return null;
}

export interface FetchSanctionsParams {
  apiKey?: string;
}

/**
 * Live OpenSanctions fetch — scaffold. With no API key, returns [] and logs the
 * key seam rather than throwing, so `pnpm check` stays green and the demo runs
 * off the bundled sample fixture. Wiring the live API is deferred (proposal 12).
 */
export async function fetchSanctions(params: FetchSanctionsParams): Promise<SanctionsEntry[]> {
  if (!params.apiKey) {
    console.warn("[opensanctions] no apiKey — set OPENSANCTIONS_API_KEY for live screening; returning []");
    return [];
  }
  console.warn("[opensanctions] live fetch not implemented yet (proposal 12); returning []");
  return [];
}
