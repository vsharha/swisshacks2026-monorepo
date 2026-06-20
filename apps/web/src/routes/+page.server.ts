import { randomUUID } from 'node:crypto';
import type { AuditEntry, RiskRating } from '@kyc/core';
import { loadBook, loadPatternLibrary } from '$lib/server/data';
import { analyzeEntity } from '$lib/server/analyze';
import { appendAudit, auditCount, currentRating, listAudit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

const now = () => new Date().toISOString();

export const load: PageServerLoad = () => {
	const book = loadBook();
	const patterns = loadPatternLibrary();

	// Timeline bounds across all signals, for the scrubber.
	const dates = book.flatMap((e) => e.signals.map((s) => s.date)).sort();
	const timeStart = dates.at(0) ?? '2024-01-01T00:00:00Z';
	const timeEnd = dates.at(-1) ?? new Date().toISOString();

	// Effective current rating per entity, replayed from the audit log.
	const ratings: Record<string, RiskRating> = {};
	for (const e of book)
		ratings[e.baseline.entityId] = currentRating(e.baseline.entityId, e.baseline.riskRating);

	return {
		book,
		patterns,
		timeStart,
		timeEnd,
		ratings,
		auditCount: auditCount(),
		audit: listAudit(undefined, 40)
	};
};

export const actions: Actions = {
	// On-demand Stage 2/3 escalation — fires only when an analyst clicks, never
	// per page load (that would defeat the cost story).
	analyze: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const asOf = String(form.get('asOf'));
		const result = await analyzeEntity(entityId, asOf);
		return { ...result, auditCount: auditCount(), audit: listAudit(undefined, 40) };
	},

	// Human-in-the-loop gate: the analyst's escalate/dismiss decision is written
	// to the append-only audit log before any risk-rating change. Escalation
	// then writes the outcome — the actual rating change.
	decide: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const decision = form.get('decision') === 'escalate' ? 'escalate' : 'dismiss';
		const rationale =
			String(form.get('rationale') ?? '').trim() ||
			(decision === 'escalate'
				? 'Confirmed structural drift; re-KYC required.'
				: 'Reviewed; no action.');

		const baseRating =
			loadBook().find((e) => e.baseline.entityId === entityId)?.baseline.riskRating ?? 'low';

		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'human_action',
			analyst: 'analyst@amina',
			decision,
			rationale
		});

		// Priority audit entries surfaced to the client as toasts.
		const events: AuditEntry[] = [];

		let rating = currentRating(entityId, baseRating);
		if (decision === 'escalate' && rating !== 'high') {
			events.push(
				appendAudit({
					id: randomUUID(),
					ts: now(),
					entityId,
					kind: 'outcome',
					fromRating: rating,
					toRating: 'high',
					newStatus: 'alert'
				})
			);
			rating = 'high';
		}

		return {
			decided: decision,
			rating,
			events,
			auditCount: auditCount(),
			audit: listAudit(undefined, 40)
		};
	}
};
