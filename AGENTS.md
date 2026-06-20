# SwissHacks 2026 monorepo

Dynamic KYC-Drift Monitor — a real-time risk-profiling system for AMINA Bank's SwissHacks 2026 challenge. Continuous cheap monitoring of a customer book, escalating to deep LLM reasoning only when a customer's KYC baseline structurally drifts.

This is an evolving prototype: all code is a target for refactoring. Favour clear, working slices over premature polish, and don't treat existing modules as fixed — reshape them freely as the design firms up.

## Frontend guidance

Use the browser to visually inspect the UI to iterate on the design and confirm it matches your vision.

The `@kyc/web` app uses shadcn-svelte (lyra preset) for UI primitives — add components with `pnpm dlx shadcn-svelte@latest add <component> -c apps/web`, then restyle tokens to the "Risk Control Room" palette in `docs/reference/frontend.md`.

## Docs

The `docs/` directory holds relevant background and reference material — consult to it when needed:

- `docs/reference/product.md` — concept, drift model, scenario, scope
- `docs/reference/techstack.md` — stack, cost architecture, extraction
- `docs/reference/frontend.md` — "Risk Control Room" design system
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
