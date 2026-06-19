# SwissHacks 2026 monorepo

Dynamic KYC-Drift Monitor — a real-time risk-profiling system for AMINA Bank's SwissHacks 2026 challenge. Continuous cheap monitoring of a customer book, escalating to deep LLM reasoning only when a customer's KYC baseline structurally drifts.

## Frontend guidance

Use the browser to visually inspect the UI to iterate on the design and confirm it matches your vision.

The `@kyc/web` app uses shadcn-svelte (lyra preset) for UI primitives — add components with `pnpm dlx shadcn-svelte@latest add <component> -c apps/web`, then restyle tokens to the "Risk Control Room" palette in `docs/frontend.md`.

## Docs

The `docs/` directory holds relevant background and reference material — consult to it when needed:

- `docs/product.md` — concept, drift model, scenario, scope
- `docs/techstack.md` — stack, cost architecture, extraction
- `docs/frontend.md` — "Risk Control Room" design system
- `docs/challenge.md`, `docs/description.md` — the original challenge brief

## Provided APIs

Access to the EventRegistry API is provided.

## Git

- Commit after each meaningful change with a short title describing what was done
- No description block
- Commit as the user, not as yourself
- Match the style of previous commit messages

## Before handing off code changes to the user

Run in order when code was affected:

1. `pnpm check` — typecheck
2. `pnpm fix` — auto-fix eslint errors and prettier formatting
3. `pnpm lint` — verify nothing remains
