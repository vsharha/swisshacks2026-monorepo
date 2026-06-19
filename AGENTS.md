# SwissHacks 2026 monorepo

## Docs

The `docs/` directory holds relevant background and reference material — consult to it when needed.

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
