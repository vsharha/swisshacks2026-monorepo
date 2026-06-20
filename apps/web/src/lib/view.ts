import type { DriftAxis, DriftVector, KYCBaseline, RiskStatus, Signal } from '@kyc/core';

/** A book entry enriched with its drift vector at the current clock. */
export interface BookEntity {
	baseline: KYCBaseline;
	signals: Signal[];
	drift: DriftVector;
}

/** RiskStatus → CSS custom property in the risk signal channel (see layout.css). */
export const statusVar: Record<RiskStatus, string> = {
	stable: 'var(--stable)',
	watch: 'var(--watch)',
	alert: 'var(--alert)'
};

/** Human labels for the five drift axes. */
export const AXIS_LABEL: Record<DriftAxis, string> = {
	business_model: 'Business model',
	ownership: 'Ownership / control',
	jurisdiction: 'Geography / jurisdiction',
	scale: 'Scale / activity',
	reputation: 'Reputation / media'
};

/** ISO timestamp → YYYY-MM-DD. */
export function fmtDate(d: string): string {
	return d.slice(0, 10);
}
