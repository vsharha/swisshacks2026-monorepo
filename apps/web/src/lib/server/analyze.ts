import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Alert, DriftAxis } from '@kyc/core';
import { AXES } from '@kyc/core';
import {
	priorComposite,
	runEscalation,
	type AxisMateriality,
	type EscalationCost
} from '@kyc/core/pipeline';
import { costUsd } from '@kyc/core/llm';
import { loadBook, loadPatternLibrary } from './data';
import { appendAudit, listAudit } from './audit';

/**
 * Server-only Stage 2/3 escalation. Lives in $lib/server so the framework keeps
 * the API key (PUBLICAI_API_KEY, read via the private env) off the client. The
 * tier orchestration itself is the shared @kyc/core `runEscalation`; this wrapper
 * adds the app-specific side effects — recording each verdict in the append-only
 * audit log — and adapts the result to the page's shape.
 *
 * Reasoning runs on Apertus (Swiss open model) over Public AI; without a key the
 * cheap deterministic tiers still run and deep synthesis is skipped.
 */

export type RunCost = EscalationCost;

export interface AnalyzeResult {
	llm: boolean;
	materiality?: Partial<Record<DriftAxis, AxisMateriality>>;
	alert?: Alert | null;
	cost?: RunCost;
}

const now = () => new Date().toISOString();

export async function analyzeEntity(entityId: string, asOf: string): Promise<AnalyzeResult> {
	const entity = loadBook().find((e) => e.baseline.entityId === entityId);
	if (!entity) return { llm: false };

	const apiKey = env.PUBLICAI_API_KEY;
	if (!apiKey) return { llm: false };

	const prior = priorComposite(listAudit(entityId, 500), entityId);

	const result = await runEscalation({
		config: {
			apiKey,
			baseURL: env.PUBLICAI_BASE_URL || undefined,
			stage2Model: env.PUBLICAI_STAGE2_MODEL || undefined,
			stage3Model: env.PUBLICAI_STAGE3_MODEL || undefined
		},
		baseline: entity.baseline,
		signals: entity.signals,
		archetypes: loadPatternLibrary(),
		asOf,
		alertId: `alert-${entityId}-${Date.now()}`,
		priorComposite: prior
	});

	// Stage 1 — record the composite-level evaluation (axis omitted) so later runs
	// can detect a delta-triggered jump (proposal 2).
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

	// Stage 2 — record each per-axis materiality verdict (with its cost).
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

	appendAudit({
		id: randomUUID(),
		ts: now(),
		entityId,
		kind: 'escalation_decision',
		composite: result.drift.composite,
		escalated: result.escalated,
		reason: result.escalationReason
	});

	if (!result.stage3) return { llm: true, materiality, alert: null, cost: result.cost };

	// Stage 3 — the synthesized RE-KYC alert.
	appendAudit({
		id: randomUUID(),
		ts: now(),
		entityId,
		kind: 'alert_raised',
		alertId: result.stage3.alert.id,
		modelVersion: result.stage3.alert.modelVersion
	});

	return { llm: true, materiality, alert: result.stage3.alert, cost: result.cost };
}
