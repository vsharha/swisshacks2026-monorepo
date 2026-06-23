import {
	KYCBaselineSchema,
	PatternArchetypeSchema,
	SignalArraySchema,
	type KYCBaseline,
	type PatternArchetype,
	type Signal
} from '@kyc/core';

/**
 * The customer book and pattern library, bundled into the build at compile time
 * via Vite's `import.meta.glob` (`?raw`, eager) rather than read from disk. This
 * is what lets the app run on Cloudflare Pages — there is no filesystem at the
 * edge, so the repo-root `data/` JSON is inlined as strings and parsed here.
 * `?raw` keeps the existing JSON.parse → Zod flow (no surprises from Vite's JSON
 * transform), and `eager` keeps these loaders synchronous.
 */

// The options must be an inline object literal — Vite static-analyses it.
const baselineRaw = import.meta.glob('../../../../../data/baselines/*.json', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;
const signalRaw = import.meta.glob('../../../../../data/signals/*.json', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;
const patternRaw = import.meta.glob('../../../../../data/pattern-library/*.json', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** Filename (with extension) for a glob key. */
function basename(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

export interface EntityData {
	baseline: KYCBaseline;
	signals: Signal[];
}

/** Load every baseline plus its merged signals (all sources). */
export function loadBook(): EntityData[] {
	const book: EntityData[] = [];
	for (const raw of Object.values(baselineRaw)) {
		const baseline = KYCBaselineSchema.parse(JSON.parse(raw));
		const signals: Signal[] = [];
		// Every signal file for this entity, regardless of source suffix
		// (eventregistry, sec, screen, …) — one connector layer, many sources.
		const prefix = `${baseline.entityId}.`;
		for (const [path, sigRaw] of Object.entries(signalRaw)) {
			if (basename(path).startsWith(prefix)) {
				signals.push(...SignalArraySchema.parse(JSON.parse(sigRaw)));
			}
		}
		book.push({ baseline, signals });
	}
	// Most-active first (hero leads the book).
	return book.sort((a, b) => b.signals.length - a.signals.length);
}

/** Load the pattern library of known drift archetypes. */
export function loadPatternLibrary(): PatternArchetype[] {
	return Object.values(patternRaw).map((raw) => PatternArchetypeSchema.parse(JSON.parse(raw)));
}
