import type { DriftAxis, DriftVector, KYCBaseline, RiskStatus, Signal } from '@kyc/core';

/** A book entry enriched with its drift vector at the current clock. */
export interface BookEntity {
	baseline: KYCBaseline;
	signals: Signal[];
	drift: DriftVector;
}

/** RiskStatus → CSS custom property in the Risk Control Room palette. */
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

/**
 * Confidence at or above which a signal is a "structural" event — the kind that
 * earns a labelled yellow dot on the timeline. Shared by the scrubber and the
 * chronological event log so the two always agree on which events are "main".
 */
export const STRUCTURAL_CONFIDENCE = 0.85;

/** Signal `type` → short label for the drift signal it gives. */
export const SIGNAL_TYPE_LABEL: Record<string, string> = {
	adverse_media: 'Adverse media',
	annual_report: 'Annual report',
	asset_disposition: 'Asset disposition',
	beneficial_ownership: 'Beneficial-ownership change',
	business_model_change: 'Business-model change',
	control_change: 'Control change',
	equity_sale: 'Equity sale',
	leadership_change: 'Leadership change',
	material_agreement: 'Material agreement',
	material_event: 'Material event',
	name_or_charter_change: 'Name / charter change',
	proxy_statement: 'Proxy statement',
	quarterly_report: 'Quarterly report',
	scale_change: 'Scale / activity change',
	securities_registration: 'Securities registration'
};

/** Readable label for a signal type, humanising any unmapped type. */
export function signalTypeLabel(type: string): string {
	return SIGNAL_TYPE_LABEL[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** ISO timestamp → YYYY-MM-DD. */
export function fmtDate(d: string): string {
	return d.slice(0, 10);
}
