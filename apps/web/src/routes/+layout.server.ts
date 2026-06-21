import { auditCount, listAudit } from '$lib/server/audit';
import type { LayoutServerLoad } from './$types';

// Global audit state for the top-bar counter and the audit drawer — both live in
// the layout, so it loads here and is merged into every page's `data`.
export const load: LayoutServerLoad = () => ({
	auditCount: auditCount(),
	audit: listAudit(undefined, 40)
});
