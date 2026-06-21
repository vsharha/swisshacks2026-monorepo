import type { HumanRole } from '@kyc/core';

/**
 * Client-only UI state shared between the layout (top-bar role switch) and the
 * entity page (governance forms). The active role isn't persisted server-side,
 * so it can't ride along on `load` — this rune is the shared source of truth.
 */
export const ui = $state<{ role: HumanRole }>({ role: 'analyst' });
