import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	KYCBaselineSchema,
	PatternArchetypeSchema,
	SignalArraySchema,
	type KYCBaseline,
	type PatternArchetype,
	type Signal
} from '@kyc/core';

/** Walk up to the workspace root (holds pnpm-workspace.yaml) to find data/. */
function repoRoot(): string {
	let dir = dirname(fileURLToPath(import.meta.url));
	while (dir !== dirname(dir)) {
		if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
		dir = dirname(dir);
	}
	throw new Error('Could not locate repo root');
}

const dataDir = join(repoRoot(), 'data');

function readJson(relPath: string): unknown {
	return JSON.parse(readFileSync(join(dataDir, relPath), 'utf8'));
}

export interface EntityData {
	baseline: KYCBaseline;
	signals: Signal[];
}

/** Load every baseline plus its merged signals (all sources). */
export function loadBook(): EntityData[] {
	const baselineFiles = readdirSync(join(dataDir, 'baselines')).filter((f) => f.endsWith('.json'));
	const book: EntityData[] = [];
	for (const file of baselineFiles) {
		const baseline = KYCBaselineSchema.parse(readJson(`baselines/${file}`));
		const signals: Signal[] = [];
		const sigDir = join(dataDir, 'signals');
		for (const source of ['eventregistry', 'sec']) {
			const rel = `signals/${baseline.entityId}.${source}.json`;
			if (existsSync(join(sigDir, `${baseline.entityId}.${source}.json`))) {
				signals.push(...SignalArraySchema.parse(readJson(rel)));
			}
		}
		book.push({ baseline, signals });
	}
	// Most-active first (hero leads the book).
	return book.sort((a, b) => b.signals.length - a.signals.length);
}

/** Load the pattern library of known drift archetypes. */
export function loadPatternLibrary(): PatternArchetype[] {
	const dir = join(dataDir, 'pattern-library');
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => PatternArchetypeSchema.parse(readJson(`pattern-library/${f}`)));
}
