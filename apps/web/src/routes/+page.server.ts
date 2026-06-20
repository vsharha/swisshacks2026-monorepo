import { randomUUID } from 'node:crypto';
import { loadBook, loadPatternLibrary } from '$lib/server/data';
import { analyzeEntity } from '$lib/server/analyze';
import { appendAudit, auditCount } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const book = loadBook();
	const patterns = loadPatternLibrary();

	// Timeline bounds across all signals, for the scrubber.
	const dates = book.flatMap((e) => e.signals.map((s) => s.date)).sort();
	const timeStart = dates.at(0) ?? '2024-01-01T00:00:00Z';
	const timeEnd = dates.at(-1) ?? new Date().toISOString();

	return { book, patterns, timeStart, timeEnd, auditCount: auditCount() };
};

export const actions: Actions = {
	// On-demand Stage 2/3 escalation — fires only when an analyst clicks, never
	// per page load (that would defeat the cost story).
	analyze: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const asOf = String(form.get('asOf'));
		const result = await analyzeEntity(entityId, asOf);
		return { ...result, auditCount: auditCount() };
	},

	// Human-in-the-loop gate: the analyst's escalate/dismiss decision is written
	// to the append-only audit log before any risk-rating change.
	decide: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const decision = form.get('decision') === 'escalate' ? 'escalate' : 'dismiss';
		const rationale =
			String(form.get('rationale') ?? '').trim() ||
			(decision === 'escalate'
				? 'Confirmed structural drift; re-KYC required.'
				: 'Reviewed; no action.');

		appendAudit({
			id: randomUUID(),
			ts: new Date().toISOString(),
			entityId,
			kind: 'human_action',
			analyst: 'analyst@amina',
			decision,
			rationale
		});

		return { decided: decision, auditCount: auditCount() };
	}
};
