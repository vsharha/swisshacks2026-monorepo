import type { Alert, AuditEntry, HumanRole } from '@kyc/core';

/**
 * Client-only UI state shared between the layout (top-bar role switch, audit
 * drawer) and the entity page (governance forms, Stage 3 detail). None of this
 * is persisted server-side, so it can't ride along on `load` — this rune is the
 * shared source of truth.
 */
export const ui = $state<{
	role: HumanRole;
	stage3: { open: boolean; alert: Alert | null };
}>({
	role: 'analyst',
	stage3: { open: false, alert: null }
});

/** A reusable, label + handler action surfaced in more than one place. */
export type UiAction = { label: string; onClick: () => void };

/**
 * Actions offered for specific audit-entry kinds — declared once here and
 * surfaced both in the toast raised when the entry is appended and in the audit
 * drawer. Keyed by kind so neither consumer hardcodes any single entry type.
 */
export const auditActions: Partial<Record<AuditEntry['kind'], UiAction>> = {
	alert_raised: { label: 'View detail', onClick: () => (ui.stage3.open = true) }
};
