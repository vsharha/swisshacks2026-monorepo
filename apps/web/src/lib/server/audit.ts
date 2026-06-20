import { createHash } from 'node:crypto';
import { AuditEntrySchema, type AuditEntry, type RiskRating } from '@kyc/core';
import { deriveCaseState, type CaseState } from '@kyc/core/governance';

/**
 * Append-only audit log — the regulatory record of the drift-detection →
 * human-decision loop. Held in memory only (a module-level array): entries
 * accumulate for the lifetime of the server process and reset clean on restart,
 * so a demo never starts from stale, polluted state. Each entry is hash-chained
 * (its hash covers the previous hash), giving tamper-evidence within a session
 * without a DB or file dependency. Server-only by virtue of living in $lib/server.
 */

const entries: AuditEntry[] = [];

function lastHash(): string | null {
	return entries.at(-1)?.hash ?? null;
}

/** Append one entry, chaining it to the previous entry's hash. */
export function appendAudit(entry: AuditEntry): AuditEntry {
	const prevHash = lastHash();
	const base = AuditEntrySchema.parse({
		...entry,
		prevHash: prevHash ?? undefined,
		hash: undefined
	});
	const hash = createHash('sha256')
		.update((prevHash ?? '') + JSON.stringify(base))
		.digest('hex');
	const full = AuditEntrySchema.parse({ ...base, hash });
	entries.push(full);
	return full;
}

/** Most-recent entries first, optionally filtered to one entity. */
export function listAudit(entityId?: string, limit = 50): AuditEntry[] {
	const filtered = entityId ? entries.filter((e) => e.entityId === entityId) : entries;
	return filtered.slice(-limit).reverse();
}

export function auditCount(): number {
	return entries.length;
}

/** Effective current rating: the most recent `outcome` for the entity, else the baseline. */
export function currentRating(entityId: string, fallback: RiskRating): RiskRating {
	let rating = fallback;
	for (const e of entries) {
		if (e.kind === 'outcome' && e.entityId === entityId) rating = e.toRating;
	}
	return rating;
}

/** Current governance case state for an entity, replayed from the log (chronological). */
export function caseStateFor(entityId: string): CaseState {
	return deriveCaseState(entries.filter((e) => e.entityId === entityId));
}
