# SwissHacks 2026 monorepo

Dynamic KYC-Drift Monitor — a real-time risk-profiling system for AMINA Bank's SwissHacks 2026 challenge. Continuous cheap monitoring of a customer book, escalating to deep LLM reasoning only when a customer's KYC baseline structurally drifts.

This is an evolving prototype: all code is a target for refactoring. Favour clear, working slices over premature polish, and don't treat existing modules as fixed — reshape them freely as the design firms up.

## Frontend guidance

Use the browser to visually inspect the UI to iterate on the design and confirm it matches your vision.

The `@kyc/web` app uses shadcn-svelte (lyra preset) for UI primitives. **Always build on shadcn — never hand-roll a primitive that shadcn already provides.** Before creating any button, dialog, drawer/sheet, tooltip, badge, input, select, tabs, popover, separator, scroll area, or similar, add it with `pnpm dlx shadcn-svelte@latest add <component> -c apps/web` and import it from `$lib/components/ui`. Restyle via the design tokens (CSS vars in `src/routes/layout.css`), not by forking the component, so palette changes propagate everywhere. Use `phosphor-svelte` for icons rather than literal glyphs, and `cn()` (`$lib/utils`) for conditional classes.

Hand-rolled markup is only acceptable for genuinely bespoke, app-specific visualisations with no shadcn equivalent (e.g. the drift radar, the register list, the cost funnel). Everything else composes shadcn primitives.

Token reference: the AMINA design system in `docs/reference/amina-design-system.md` — it drives shadcn via the CSS vars in `layout.css`.

## Dev server

- Before starting the dev server, check whether one is already running for this project (e.g. `pgrep -fl "vite dev"`, or probe the expected port) and reuse it rather than spawning another.
- When a change requires a fresh process (config, deps, env), kill the existing dev server and restart it — never leave multiple instances running at once.

## Docs

The `docs/` directory holds relevant background and reference material — consult to it when needed:

- `docs/reference/product.md` — concept, drift model, scenario, scope
- `docs/reference/techstack.md` — stack, cost architecture, extraction
- `docs/reference/amina-design-system.md` — "Supervisory" design system in AMINA's brand language
- `docs/brief/challenge.md`, `docs/brief/description.md` — the original challenge brief

## Provided APIs

Access to the EventRegistry API is provided.

## Committing guidance

- Always `git pull` before committing
- Commit after each meaningful change with a short title describing what was done
- No description block
- Commit as the user, not as yourself
- Match the style of previous commit messages

## Before committing

Run in order when code was affected:

1. `pnpm check` — typecheck
2. `pnpm fix` — auto-fix eslint errors and prettier formatting
3. `pnpm lint` — verify nothing remains
