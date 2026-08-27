import { RatingConfigSchema, DEFAULT_RATING_CONFIG, type RatingConfig } from '@kyc/core';

/**
 * The active KYC risk-rating scale. In-memory only (like the audit log): the
 * institution customises it through the settings editor, and it resets to the
 * default on server restart. This matches the app's stateless-deploy model
 * (Cloudflare Workers — no writable filesystem). Server-only via `$lib/server`.
 */
let config: RatingConfig = DEFAULT_RATING_CONFIG;

export function getRatingConfig(): RatingConfig {
	return config;
}

/** Validate and replace the whole scale. Throws (Zod) on an invalid payload. */
export function setRatingConfig(next: unknown): RatingConfig {
	config = RatingConfigSchema.parse(next);
	return config;
}
