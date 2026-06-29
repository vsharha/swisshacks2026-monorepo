import { randomUUID } from 'node:crypto';
import { error, fail } from '@sveltejs/kit';
import type { AuditEntry, HumanDecision, HumanRole } from '@kyc/core';
import { governanceCheck } from '@kyc/core/governance';
import { buildGraph } from '@kyc/core/graph';
import { loadBook, loadPatternLibrary } from '$lib/server/data';
import { ANALYZABLE, analyzeEntity, capturedPatternMatchFor } from '$lib/server/analyze';
import { appendAudit, auditCount, caseStateFor, currentRating, listAudit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

const now = () => new Date().toISOString();

export const load: PageServerLoad = ({ params }) => {
	const book = loadBook();
	const entity = book.find((e) => e.baseline.entityId === params.entityId);
	if (!entity) error(404, 'Customer not found');

	// Relationship layer for the ownership graph — built from the whole book so
	// shared owners and multi-hop links resolve, then narrowed in the component.
	const graph = buildGraph(book.map((e) => e.baseline));
	const patterns = loadPatternLibrary();

	// Timeline bounds across this customer's own signals, for the scrubber/replay.
	const dates = entity.signals.map((s) => s.date).sort();
	const timeStart = dates.at(0) ?? '2024-01-01T00:00:00Z';
	const timeEnd = dates.at(-1) ?? new Date().toISOString();

	return {
		entity,
		graph,
		archetypes: patterns,
		capturedPatternMatch: capturedPatternMatchFor(entity.baseline.entityId),
		analyzable: ANALYZABLE.has(entity.baseline.entityId),
		rating: currentRating(entity.baseline.entityId, entity.baseline.riskRating),
		caseState: caseStateFor(entity.baseline.entityId),
		timeStart,
		timeEnd
	};
};

export const actions: Actions = {
	// On-demand Stage 2/3 escalation — fires only when an analyst clicks, never
	// per page load (that would defeat the cost story).
	analyze: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const result = await analyzeEntity(entityId);
		return { ...result, auditCount: auditCount(), audit: listAudit(undefined, 40) };
	},

	// Maker step (analyst): propose an escalation or dismiss. Escalation moves the
	// case to pending compliance approval — it does NOT change the rating here.
	decide: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const role = String(form.get('role')) as HumanRole;
		const decision = (
			form.get('decision') === 'escalate' ? 'escalate' : 'dismiss'
		) as HumanDecision;
		const rationale =
			String(form.get('rationale') ?? '').trim() ||
			(decision === 'escalate'
				? 'Structural drift observed; escalating for compliance review.'
				: 'Reviewed; no action.');

		const check = governanceCheck(role, decision, caseStateFor(entityId).status);
		if (!check.ok) return fail(403, { error: check.reason });

		const baseRating =
			loadBook().find((e) => e.baseline.entityId === entityId)?.baseline.riskRating ?? 'low';

		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'human_action',
			actor: 'analyst@amina',
			role: 'analyst',
			decision,
			rationale
		});

		return {
			case: caseStateFor(entityId),
			rating: currentRating(entityId, baseRating),
			auditCount: auditCount(),
			audit: listAudit(undefined, 40)
		};
	},

	// Checker step (compliance officer): approve or reject a pending escalation.
	// Approval is the checkpoint that writes the actual rating change (outcome).
	review: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const role = String(form.get('role')) as HumanRole;
		const decision = (form.get('decision') === 'approve' ? 'approve' : 'reject') as HumanDecision;
		const rationale =
			String(form.get('rationale') ?? '').trim() ||
			(decision === 'approve'
				? 'Escalation confirmed; re-KYC authorised.'
				: 'Returned to analyst; insufficient basis.');

		const check = governanceCheck(role, decision, caseStateFor(entityId).status);
		if (!check.ok) return fail(403, { error: check.reason });

		const baseRating =
			loadBook().find((e) => e.baseline.entityId === entityId)?.baseline.riskRating ?? 'low';

		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'human_action',
			actor: 'mlro@amina',
			role: 'compliance_officer',
			decision,
			rationale
		});

		// Priority audit entries surfaced to the client as toasts.
		const events: AuditEntry[] = [];

		let rating = currentRating(entityId, baseRating);
		if (decision === 'approve' && rating !== 'high') {
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
			case: caseStateFor(entityId),
			rating,
			events,
			auditCount: auditCount(),
			audit: listAudit(undefined, 40)
		};
	}
};
