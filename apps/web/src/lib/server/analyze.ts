import { randomUUID } from 'node:crypto';
import type { Alert, AuditEntry, DriftAxis, PatternMatch } from '@kyc/core';
import { AXES } from '@kyc/core';
import type { AxisMateriality, EscalationCost, EscalationResult } from '@kyc/core/pipeline';
import { costUsd } from '@kyc/core/llm/cost';
import { appendAudit } from './audit';

/**
 * Stage 2/3 replay. The escalation cascade is expensive and hits an external LLM,
 * so the public demo never runs it live: instead we replay deterministic verdicts
 * captured offline (`pnpm --filter @kyc/scripts capture`) into `data/analysis/`.
 *
 * This keeps the deployed SvelteKit app free of all real-API logic — no LLM
 * client, no connectors — which is both the cost story and what makes it safe to
 * publish. Only the two demo heroes have a captured analysis; every other entity
 * returns `{ llm: false }` (its Analyze button is hidden in the UI).
 *
 * The side effects mirror the old live path exactly: each tier's verdict is
 * recorded in the append-only audit log and the result is adapted to the page's
 * shape, so the UI and audit drawer behave identically.
 */

export type RunCost = EscalationCost;

export interface AnalyzeResult {
	llm: boolean;
	materiality?: Partial<Record<DriftAxis, AxisMateriality>>;
	alert?: Alert | null;
	cost?: RunCost;
	/** Priority audit entries appended this run, for client-side toasts. */
	events?: AuditEntry[];
}

const now = () => new Date().toISOString();

// Captured escalation results, bundled at build time (see data.ts for why ?raw).
const fixtureRaw = import.meta.glob('../../../../../data/analysis/*.json', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const FIXTURES: Record<string, EscalationResult> = Object.fromEntries(
	Object.entries(fixtureRaw).map(([path, raw]) => [
		path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, ''),
		JSON.parse(raw) as EscalationResult
	])
);

/** Entities with a captured analysis to replay (heroes). */
export const ANALYZABLE = new Set(Object.keys(FIXTURES));

/** Captured Stage 3 pattern match, when the offline analysis produced one. */
export function capturedPatternMatchFor(entityId: string): PatternMatch | undefined {
	return FIXTURES[entityId]?.stage3?.alert.patternMatch;
}

/**
 * Replay the captured escalation for an entity, recording each tier in the audit
 * log. There is no `asOf` parameter — the fixture is the canonical analysis,
 * independent of the scrubber clock.
 */
export async function analyzeEntity(entityId: string): Promise<AnalyzeResult> {
	const result = FIXTURES[entityId];
	if (!result) return { llm: false };

	// Hold for the deep-reasoning beat so the Stage 3 toast lands like the real thing.
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Stage 1 — composite-level evaluation (axis omitted) so later runs can detect
	// a delta-triggered jump.
	const compositeConfidence = Math.max(...AXES.map((a) => result.drift.axes[a].confidence));
	appendAudit({
		id: randomUUID(),
		ts: now(),
		entityId,
		kind: 'drift_evaluated',
		tier: 'stage1',
		score: result.drift.composite,
		confidence: compositeConfidence
	});

	// Stage 2 — each per-axis materiality verdict (with its cost).
	const materiality: Partial<Record<DriftAxis, AxisMateriality>> = {};
	for (const { axis, result: m, usage, model } of result.stage2) {
		materiality[axis] = m;
		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'drift_evaluated',
			axis,
			tier: 'stage2',
			score: m.score,
			confidence: m.confidence,
			cost: {
				stage: 'stage2',
				model,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				usd: costUsd(model, usage)
			}
		});
	}

	// Priority audit entries surfaced to the client as toasts.
	const events: AuditEntry[] = [];

	events.push(
		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'escalation_decision',
			composite: result.drift.composite,
			escalated: result.escalated,
			reason: result.escalationReason
		})
	);

	if (!result.stage3) return { llm: true, materiality, alert: null, cost: result.cost, events };

	// Stage 3 — the synthesized RE-KYC alert.
	events.push(
		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'alert_raised',
			alertId: result.stage3.alert.id,
			modelVersion: result.stage3.alert.modelVersion
		})
	);

	return { llm: true, materiality, alert: result.stage3.alert, cost: result.cost, events };
}
