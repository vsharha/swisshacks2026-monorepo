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

/** SEC 8-K item code → short plain-English label. */
const SEC_ITEM_LABEL: Record<string, string> = {
	'1.01': 'Material agreement',
	'1.02': 'Agreement terminated',
	'2.01': 'Acquisition / disposition',
	'2.02': 'Earnings release',
	'3.02': 'Unregistered equity sale',
	'5.01': 'Change in control',
	'5.02': 'Executive / board change',
	'5.03': 'Charter / name change',
	'7.01': 'Reg FD disclosure',
	'8.01': 'Other event',
	'9.01': 'Financial statements & exhibits'
};

/** SEC form type → short plain-English label. */
const SEC_FORM_LABEL: Record<string, string> = {
	'8-K': 'Current report',
	'10-Q': 'Quarterly report',
	'10-K': 'Annual report',
	'25': 'Delisting notice',
	'25-NSE': 'Delisting notice',
	'SC 13D': 'Beneficial ownership (active)',
	'SC 13G': 'Beneficial ownership (passive)',
	'DEF 14A': 'Proxy statement',
	'S-1': 'Securities registration'
};

/**
 * Plain-English gloss for an SEC filing signal, derived from its payload form /
 * item codes. For an 8-K, expands each item code (e.g. "5.02" → "Executive /
 * board change"); otherwise labels the form. Returns null for non-SEC signals
 * (news etc.), which carry no form code.
 */
export function secFilingDescription(s: Signal): string | null {
	if (s.source !== 'sec_edgar') return null;
	const form = typeof s.payload.form === 'string' ? s.payload.form : null;
	if (!form) return null;
	const items = typeof s.payload.items === 'string' ? s.payload.items : '';
	if (form === '8-K' && items) {
		return items
			.split(/[,\s]+/)
			.filter(Boolean)
			.map((code) => SEC_ITEM_LABEL[code] ?? `Item ${code}`)
			.join(' · ');
	}
	return SEC_FORM_LABEL[form] ?? null;
}

/** Raw SEC form code for a filing signal (e.g. "10-Q", "8-K"), or null for non-SEC signals. */
export function secFormCode(s: Signal): string | null {
	if (s.source !== 'sec_edgar') return null;
	return typeof s.payload.form === 'string' ? s.payload.form : null;
}
