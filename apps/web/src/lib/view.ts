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

/**
 * Per-entity HQ city → coordinates. Entities only carry an ISO-2 jurisdiction;
 * a city reads as a real place and (on the globe) separates same-country
 * companies without jitter. Graduate to a baseline field if HQ becomes data.
 */
export const HQ: Record<string, { city: string; lat: number; lng: number }> = {
	'alpine-components': { city: 'Zurich', lat: 47.3769, lng: 8.5417 },
	'helvetia-trading': { city: 'Geneva', lat: 46.2044, lng: 6.1432 },
	'nordtrade-holding': { city: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
	'gulf-bridge-capital': { city: 'Dubai', lat: 25.2048, lng: 55.2708 },
	smartbird: { city: 'San Francisco', lat: 37.7749, lng: -122.4194 },
	strategy: { city: 'Tysons, VA', lat: 38.9187, lng: -77.2311 }
};

/** ISO-2 jurisdiction → flag emoji. */
export const FLAG: Record<string, string> = { CH: '🇨🇭', DE: '🇩🇪', AE: '🇦🇪', US: '🇺🇸' };

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

/** Narrow a payload value to a number, or null. */
function num(v: unknown): number | null {
	return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Narrow a payload value to a non-empty string, or null. */
function str(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Compact USD: $1.2B / $340M / $5K / $42. */
function fmtUsd(n: number): string {
	const abs = Math.abs(n);
	const sign = n < 0 ? '-' : '';
	if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
	if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
	if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
	return `${sign}$${abs}`;
}

/**
 * Supporting research/evidence context for a signal, derived from its source
 * and `payload`. Honours an explicit `marketResearch` field when present;
 * otherwise synthesises a concise summary from the structured extras each
 * connector carries (media coverage, market data, filings, on-chain, etc.).
 */
export function deriveMarketResearch(s: Signal): string {
	if (s.marketResearch) return s.marketResearch;
	const p = s.payload;
	switch (s.source) {
		case 'eventregistry': {
			const cluster = num(p.clusterSize) ?? 1;
			const sentiment = num(p.sentiment);
			const outlet = str(p.sourceTitle);
			const tone =
				sentiment === null
					? null
					: sentiment > 0.15
						? 'positive'
						: sentiment < -0.15
							? 'negative'
							: 'neutral';
			const parts = [`${cluster} correlated report${cluster === 1 ? '' : 's'}`];
			if (tone)
				parts.push(`${tone} coverage${sentiment === null ? '' : ` (${sentiment.toFixed(2)})`}`);
			if (outlet) parts.push(outlet);
			return parts.join(' · ');
		}
		case 'market': {
			const parts: string[] = [];
			const changePct = num(p.changePct);
			const valuation = num(p.valuationUsd);
			const amount = num(p.amountUsd);
			if (changePct !== null) parts.push(`${changePct > 0 ? '+' : ''}${changePct}% YoY`);
			if (valuation !== null) parts.push(`mkt cap ${fmtUsd(valuation)}`);
			if (amount !== null) parts.push(`${fmtUsd(amount)} move`);
			return parts.length ? `Market data — ${parts.join(' · ')}` : 'Market data';
		}
		case 'sec_edgar': {
			const form = str(p.form);
			const reportDate = str(p.reportDate);
			return `Regulatory filing${form ? ` ${form}` : ''}${reportDate ? ` · ${reportDate.slice(0, 10)}` : ''}`;
		}
		case 'chain': {
			const magnitude = num(p.magnitudeUsd);
			const asset = str(p.asset);
			const share = num(p.share);
			const chain = str(p.chain);
			if (magnitude !== null) {
				const parts = [`On-chain — ${fmtUsd(magnitude)}${asset ? ` in ${asset}` : ''}`];
				if (share !== null) parts.push(`${(share * 100).toFixed(0)}% of holdings`);
				return parts.join(' · ');
			}
			const parts = ['On-chain'];
			if (chain) parts.push(chain);
			if (p.exposure && typeof p.exposure === 'object') {
				const ex = Object.entries(p.exposure as Record<string, unknown>)
					.filter(([, v]) => typeof v === 'number')
					.map(([k, v]) => `${k} ${(v as number).toFixed(2)}`);
				if (ex.length) parts.push(ex.join(', '));
			}
			if (Array.isArray(p.counterparties) && p.counterparties.length) {
				const names = p.counterparties.filter((c): c is string => typeof c === 'string');
				if (names.length) parts.push(`counterparty: ${names.join(', ')}`);
			}
			return parts.join(' · ');
		}
		case 'graph': {
			const hops = num(p.hops);
			const from = str(p.from) ?? str(p.origin);
			const parts = ['Network link'];
			if (hops !== null) parts.push(`${hops} hop${hops === 1 ? '' : 's'}`);
			if (from) parts.push(`from ${from}`);
			return parts.join(' · ');
		}
		case 'internal': {
			const kind = str(p.kind);
			const resolved = p.hasOutcome === true;
			return `Internal ${kind ? kind.replace(/_/g, ' ') : 'record'} (${resolved ? 'resolved' : 'open'})`;
		}
		case 'opensanctions': {
			const list = str(p.list);
			const matchType = str(p.matchType);
			const owner = str(p.owner);
			return `Screening hit${list ? ` — ${list}` : ''}${matchType ? ` (${matchType} match)` : ''}${owner ? ` on ${owner}` : ''}`;
		}
		case 'regulator': {
			const level = str(p.level);
			const country = str(p.country);
			const owner = str(p.owner);
			return `Regulator notice${level ? ` — ${level}` : ''}${country ? ` (${country})` : ''}${owner ? ` re ${owner}` : ''}`;
		}
		case 'linkedin': {
			const focus = str(p.focus);
			if (focus) return `Hiring pivot → ${focus}`;
			const parts: string[] = [];
			const changePct = num(p.changePct);
			const headcount = num(p.headcount);
			const openRoles = num(p.openRoles);
			if (changePct !== null) parts.push(`${changePct > 0 ? '+' : ''}${changePct}% headcount`);
			if (headcount !== null) parts.push(`${headcount} staff`);
			if (openRoles !== null) parts.push(`${openRoles} open roles`);
			return parts.length ? `Hiring · ${parts.join(' · ')}` : 'Hiring signal';
		}
		default:
			return `${s.source.replace(/_/g, ' ')} record`;
	}
}

/**
 * Per-signal drift inference — a concise read of what this event implies for the
 * KYC baseline. Honours an explicit `signalInference` field; otherwise derives a
 * line from the axis, type, confidence band, and any directional payload cue.
 */
export function deriveSignalInference(s: Signal): string {
	if (s.signalInference) return s.signalInference;
	const axis = AXIS_LABEL[s.axis].toLowerCase();
	const band = s.confidence >= 0.85 ? 'Strong' : s.confidence >= 0.6 ? 'Moderate' : 'Weak';
	const typeText = s.type.replace(/_/g, ' ');
	const sentiment = num(s.payload.sentiment);
	const changePct = num(s.payload.changePct);
	let nuance = '';
	if (s.axis === 'reputation' && sentiment !== null) {
		nuance = sentiment < -0.15 ? ' — adverse tone' : sentiment > 0.15 ? ' — favourable tone' : '';
	} else if (s.axis === 'scale' && changePct !== null) {
		nuance = changePct < 0 ? ' — contraction' : ' — expansion';
	}
	return `${band} ${axis} drift signal (${typeText})${nuance}.`;
}

/**
 * Two-word inference for a compact column: confidence band + direction
 * (`adverse` / `favourable` / `contraction` / `expansion`, else `drift`). Use
 * `deriveSignalInference` for the full sentence (e.g. as a tooltip).
 */
export function deriveSignalInferenceShort(s: Signal): string {
	const band = s.confidence >= 0.85 ? 'Strong' : s.confidence >= 0.6 ? 'Moderate' : 'Weak';
	const sentiment = num(s.payload.sentiment);
	const changePct = num(s.payload.changePct);
	let direction = 'drift';
	if (s.axis === 'reputation' && sentiment !== null) {
		if (sentiment < -0.15) direction = 'adverse';
		else if (sentiment > 0.15) direction = 'favourable';
	} else if (s.axis === 'scale' && changePct !== null) {
		direction = changePct < 0 ? 'contraction' : 'expansion';
	}
	return `${band} ${direction}`;
}
