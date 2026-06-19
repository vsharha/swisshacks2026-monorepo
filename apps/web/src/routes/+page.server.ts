import { loadBook, loadPatternLibrary } from '$lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const book = loadBook();
	const patterns = loadPatternLibrary();

	// Timeline bounds across all signals, for the scrubber.
	const dates = book.flatMap((e) => e.signals.map((s) => s.date)).sort();
	const timeStart = dates.at(0) ?? '2024-01-01T00:00:00Z';
	const timeEnd = dates.at(-1) ?? new Date().toISOString();

	return { book, patterns, timeStart, timeEnd };
};
