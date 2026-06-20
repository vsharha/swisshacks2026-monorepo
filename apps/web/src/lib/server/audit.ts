import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { AuditEntrySchema, type AuditEntry } from '@kyc/core';
import { dataDir } from './data';

/**
 * Append-only audit log — the regulatory record of the drift-detection →
 * human-decision loop. Stored as hash-chained JSON Lines (`data/audit.jsonl`):
 * each entry's hash covers the previous hash, so any tampering with an earlier
 * line breaks every hash after it (tamper-evidence without a DB dependency).
 * Server-only by virtue of living in $lib/server.
 */

const auditFile = join(dataDir, 'audit.jsonl');

function readLines(): string[] {
	if (!existsSync(auditFile)) return [];
	return readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
}

function lastHash(): string | null {
	const lines = readLines();
	if (lines.length === 0) return null;
	const last = JSON.parse(lines[lines.length - 1]!) as AuditEntry;
	return last.hash ?? null;
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
	mkdirSync(dataDir, { recursive: true });
	appendFileSync(auditFile, JSON.stringify(full) + '\n', 'utf8');
	return full;
}

/** Most-recent entries first, optionally filtered to one entity. */
export function listAudit(entityId?: string, limit = 50): AuditEntry[] {
	let entries = readLines().map((l) => AuditEntrySchema.parse(JSON.parse(l)));
	if (entityId) entries = entries.filter((e) => e.entityId === entityId);
	return entries.slice(-limit).reverse();
}

export function auditCount(): number {
	return readLines().length;
}
