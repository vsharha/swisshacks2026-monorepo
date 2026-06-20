import { env } from '$env/dynamic/private';
import { AXES, type Alert, type DriftAxis } from '@kyc/core';
import { scoreDriftVector } from '@kyc/core/drift';
import { reasonAxisMateriality, synthesizeAlert } from '@kyc/core/pipeline';
import { loadBook, loadPatternLibrary } from './data';

/**
 * Server-only Stage 2/3 escalation. Lives in $lib/server so the framework keeps
 * it (and ANTHROPIC_API_KEY, read via the private env) off the client. Runs the
 * same @kyc/core tiers as the offline scripts; returns the rule-based result
 * untouched when no key is configured.
 */

export type AxisMateriality = Awaited<ReturnType<typeof reasonAxisMateriality>>;

export interface AnalyzeResult {
	llm: boolean;
	materiality?: Partial<Record<DriftAxis, AxisMateriality>>;
	alert?: Alert | null;
}

export async function analyzeEntity(entityId: string, asOf: string): Promise<AnalyzeResult> {
	const entity = loadBook().find((e) => e.baseline.entityId === entityId);
	if (!entity) return { llm: false };

	const drift = scoreDriftVector(entity.baseline, entity.signals, { asOf });

	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) return { llm: false };

	const config = { apiKey };
	const evidence = entity.signals.filter((s) => s.date <= asOf);

	// Stage 2 — reason only about the axes that moved.
	const drifting = AXES.filter((a) => drift.axes[a].status !== 'stable');
	const materiality: Partial<Record<DriftAxis, AxisMateriality>> = {};
	for (const axis of drifting) {
		materiality[axis] = await reasonAxisMateriality({
			config,
			baseline: entity.baseline,
			axis,
			signals: evidence.filter((s) => s.axis === axis),
			prior: drift.axes[axis]
		});
	}

	// Stage 3 — synthesize only when the composite crosses into alert.
	if (drift.status !== 'alert') return { llm: true, materiality, alert: null };

	const alert = await synthesizeAlert({
		config,
		baseline: entity.baseline,
		drift,
		signals: entity.signals,
		archetypes: loadPatternLibrary(),
		alertId: `alert-${entityId}-${Date.now()}`
	});

	return { llm: true, materiality, alert };
}
