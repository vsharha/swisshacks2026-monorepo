import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { AXES, type Alert, type DriftAxis } from '@kyc/core';
import { scoreDriftVector } from '@kyc/core/drift';
import { reasonAxisMateriality, synthesizeAlert, type AxisMateriality } from '@kyc/core/pipeline';
import { costUsd, type LLMUsage } from '@kyc/core/llm';
import { loadBook, loadPatternLibrary } from './data';
import { appendAudit } from './audit';

/**
 * Server-only Stage 2/3 escalation. Lives in $lib/server so the framework keeps
 * it (and ANTHROPIC_API_KEY, read via the private env) off the client. Runs the
 * same @kyc/core tiers as the offline scripts, records real token cost, and
 * writes the escalation/alert events to the append-only audit log.
 */

export interface RunCost {
	/** Stage-2 LLM calls made (one per drifting axis). */
	stage2Calls: number;
	inputTokens: number;
	outputTokens: number;
	usd: number;
}

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

	const drift = scoreDriftVector(entity.baseline, entity.signals, { asOf });

	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) return { llm: false };

	const config = { apiKey };
	const evidence = entity.signals.filter((s) => s.date <= asOf);
	const cost: RunCost = { stage2Calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };

	const tally = (model: string, usage: LLMUsage) => {
		cost.inputTokens += usage.inputTokens;
		cost.outputTokens += usage.outputTokens;
		cost.usd += costUsd(model, usage);
	};

	// Stage 2 — reason only about the axes that moved.
	const drifting = AXES.filter((a) => drift.axes[a].status !== 'stable');
	const materiality: Partial<Record<DriftAxis, AxisMateriality>> = {};
	for (const axis of drifting) {
		const { result, usage, model } = await reasonAxisMateriality({
			config,
			baseline: entity.baseline,
			axis,
			signals: evidence.filter((s) => s.axis === axis),
			prior: drift.axes[axis]
		});
		materiality[axis] = result;
		cost.stage2Calls += 1;
		tally(model, usage);
		appendAudit({
			id: randomUUID(),
			ts: now(),
			entityId,
			kind: 'drift_evaluated',
			axis,
			tier: 'stage2',
			score: result.score,
			confidence: result.confidence,
			cost: {
				stage: 'stage2',
				model,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				usd: costUsd(model, usage)
			}
		});
	}

	const escalated = drift.status === 'alert';
	appendAudit({
		id: randomUUID(),
		ts: now(),
		entityId,
		kind: 'escalation_decision',
		composite: drift.composite,
		escalated,
		reason: escalated
			? `Composite ${drift.composite.toFixed(2)} crossed the alert threshold.`
			: `Composite ${drift.composite.toFixed(2)} below the alert threshold.`
	});

	if (!escalated) return { llm: true, materiality, alert: null, cost };

	// Stage 3 — synthesize the RE-KYC alert.
	const alertId = `alert-${entityId}-${Date.now()}`;
	const { alert, usage, model } = await synthesizeAlert({
		config,
		baseline: entity.baseline,
		drift,
		signals: entity.signals,
		archetypes: loadPatternLibrary(),
		alertId
	});
	tally(model, usage);
	appendAudit({
		id: randomUUID(),
		ts: now(),
		entityId,
		kind: 'alert_raised',
		alertId: alert.id,
		modelVersion: alert.modelVersion
	});

	return { llm: true, materiality, alert, cost };
}
