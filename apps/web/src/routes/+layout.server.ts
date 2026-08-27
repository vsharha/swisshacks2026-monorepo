import { auditCount, listAudit } from '$lib/server/audit';
import { getRatingConfig } from '$lib/server/ratings';
import type { LayoutServerLoad } from './$types';

// Global state for every page: the audit trail (top-bar counter + drawer) and the
// customisable KYC rating scale. Loaded here and merged into every page's `data`.
export const load: LayoutServerLoad = () => ({
	auditCount: auditCount(),
	audit: listAudit(undefined, 40),
	ratingConfig: getRatingConfig()
});
