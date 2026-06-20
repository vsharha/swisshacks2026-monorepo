# SwissHacks 2026 monorepo

Dynamic KYC-Drift Monitor — a real-time risk-profiling system for AMINA Bank's SwissHacks 2026 challenge. Continuous cheap monitoring of a customer book, escalating to deep LLM reasoning only when a customer's KYC baseline structurally drifts.

This is an evolving prototype: all code is a target for refactoring. Favour clear, working slices over premature polish, and don't treat existing modules as fixed — reshape them freely as the design firms up.

## Frontend guidance

Use the browser to visually inspect the UI to iterate on the design and confirm it matches your vision.

The `@kyc/web` app uses shadcn-svelte (lyra preset) for UI primitives. **Always build on shadcn — never hand-roll a primitive that shadcn already provides.** Before creating any button, dialog, drawer/sheet, tooltip, badge, input, select, tabs, popover, separator, scroll area, or similar, add it with `pnpm dlx shadcn-svelte@latest add <component> -c apps/web` and import it from `$lib/components/ui`. Restyle via the design tokens (CSS vars in `src/routes/layout.css`), not by forking the component, so palette changes propagate everywhere. Use `phosphor-svelte` for icons rather than literal glyphs, and `cn()` (`$lib/utils`) for conditional classes.

Hand-rolled markup is only acceptable for genuinely bespoke, app-specific visualisations with no shadcn equivalent (e.g. the drift radar, the register list, the cost funnel). Everything else composes shadcn primitives.

Token reference: the "Risk Control Room" dark palette in `docs/reference/frontend.md`, or the AMINA light reskin in `docs/reference/amina-design-system.md` — both drive shadcn via the same CSS vars.

## Docs

The `docs/` directory holds relevant background and reference material — consult to it when needed:

- `docs/reference/product.md` — concept, drift model, scenario, scope
- `docs/reference/techstack.md` — stack, cost architecture, extraction
- `docs/reference/frontend.md` — "Risk Control Room" design system (original dark terminal)
- `docs/reference/amina-design-system.md` — "Supervisory" light reskin in AMINA's real brand language
- `docs/brief/challenge.md`, `docs/brief/description.md` — the original challenge brief

## Provided APIs

Access to the EventRegistry API is provided.

## Commtting guidance

- Commit after each meaningful change with a short title describing what was done
- Commit all unstaged changes, not just your additions — review any changes you didn't make before including them, and flag anything that looks unintended rather than committing it blindly
- No description block
- Commit as the user, not as yourself
- Match the style of previous commit messages

## Before committing

Run in order when code was affected:

1. `pnpm check` — typecheck
2. `pnpm fix` — auto-fix eslint errors and prettier formatting
3. `pnpm lint` — verify nothing remains
