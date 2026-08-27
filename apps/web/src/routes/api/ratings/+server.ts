import { json, error } from '@sveltejs/kit';
import { setRatingConfig } from '$lib/server/ratings';
import type { RequestHandler } from './$types';

/** Replace the KYC rating scale. Body: a `RatingConfig` ({ levels: [...] }). */
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}
	try {
		return json(setRatingConfig(body));
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Invalid rating scale');
	}
};
