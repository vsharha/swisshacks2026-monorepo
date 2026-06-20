import { loadBook, loadPatternLibrary } from '$lib/server/data';
import { analyzeEntity } from '$lib/server/analyze';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const book = loadBook();
	const patterns = loadPatternLibrary();

	// Timeline bounds across all signals, for the scrubber.
	const dates = book.flatMap((e) => e.signals.map((s) => s.date)).sort();
	const timeStart = dates.at(0) ?? '2024-01-01T00:00:00Z';
	const timeEnd = dates.at(-1) ?? new Date().toISOString();

	return { book, patterns, timeStart, timeEnd };
};

export const actions: Actions = {
	// On-demand Stage 2/3 escalation — fires only when an analyst clicks, never
	// per page load (that would defeat the cost story).
	analyze: async ({ request }) => {
		const form = await request.formData();
		const entityId = String(form.get('entityId'));
		const asOf = String(form.get('asOf'));
		return analyzeEntity(entityId, asOf);
	}
};
