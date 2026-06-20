import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Alert, DriftAxis } from '@kyc/core';
import { runEscalation, type AxisMateriality, type EscalationCost } from '@kyc/core/pipeline';
import { costUsd } from '@kyc/core/llm';
import { loadBook, loadPatternLibrary } from './data';
import { appendAudit } from './audit';

/**
 * Server-only Stage 2/3 escalation. Lives in $lib/server so the framework keeps
 * it (and ANTHROPIC_API_KEY, read via the private env) off the client. The tier
 * orchestration itself is the shared @kyc/core `runEscalation`; this wrapper
 * adds the app-specific side effects — recording each verdict in the append-only
 * audit log — and adapts the result to the page's shape.
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

	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) return { llm: false };

	const result = await runEscalation({
		config: { apiKey },
		baseline: entity.baseline,
		signals: entity.signals,
		archetypes: loadPatternLibrary(),
		asOf,
		alertId: `alert-${entityId}-${Date.now()}`
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
		reason: result.escalated
			? `Composite ${result.drift.composite.toFixed(2)} crossed the alert threshold.`
			: `Composite ${result.drift.composite.toFixed(2)} below the alert threshold.`
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
