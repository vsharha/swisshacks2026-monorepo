import { loadBook } from '$lib/server/data';
import type { PageServerLoad } from './$types';

// Home / overview: the whole customer book, scored client-side for the globe,
// register and event feed. The clock is "now" — the latest signal across the book.
export const load: PageServerLoad = () => {
	const book = loadBook();
	const timeEnd =
		book
			.flatMap((e) => e.signals.map((s) => s.date))
			.sort()
			.at(-1) ?? new Date().toISOString();

	return { book, timeEnd };
};
