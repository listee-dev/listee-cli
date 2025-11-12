# Repository Guidelines

## Purpose for Agents
- This document targets autonomous coding agents. Humans should refer to `README.md` for onboarding.
- Agents must follow the Listee org conventions observed in sibling repos (`listee-libs`, `listee-ci`) and keep changes minimal and well-justified.

## Repository Layout Awareness
- Source of truth: `src/index.ts` wires Commander, `src/commands/` hosts CLI handlers, and `src/services/` stores Listee API-facing logic. Tests will expand under `tests/`.
- Keep generated output in `dist/` (never commit). Respect any existing files—do not alter unrelated modules.
- When referencing other org repos, treat them as read-only unless explicitly instructed.

## Tooling & Commands
- Use Bun `1.2.22`. Verify with `bun --version` if unsure.
- Core commands:
  - `bun install` — install deps; do not swap package manager.
  - `bun run build` — compile TypeScript to `dist/`.
  - `bun run dev` — rebuild and execute `node dist/index.js` for smoke tests.
  - `bun run lint` — run Biome in CI mode; resolve all diagnostics.
  - `bun test` — execute Bun tests; prefer running before submitting edits touching logic.

## Coding Standards
- TypeScript strict mode: forbid `any`, `as` assertions, and implicit `any`. Implement type guards when narrowing is required.
- Indentation is two spaces, LF line endings, `kebab-case` filenames for modules, `camelCase` for identifiers. Maintain ASCII unless the file already uses Unicode.
- Keep comments purposeful; avoid restating the obvious. Add brief context only for non-trivial flows (e.g., token refresh sequencing).

## Listee API & Secrets Handling
- Read `LISTEE_API_URL` from environment variables or `.env`; never hardcode endpoints or secrets.
- Keytar service name defaults to `listee-cli`. If a feature demands overrides, surface them via env vars or CLI flags.

## Safety & Review Protocol
- Before writing, inspect existing diffs (`git status`) and leave unrelated changes untouched.
- Prefer `rg` for searches; avoid heavy global `find` or `grep` unless necessary.
- After modifications, validate with relevant commands (lint, tests). Summarize outcomes in the agent response.
- Do not request elevated permissions without clear justification; log attempts and fallback plans.

## Reporting Expectations
- Respond in Japanese, unless future instructions override.
- Provide concise summaries of changes, list affected files using inline code paths, and suggest next steps when appropriate.
- Highlight assumptions, cite verification commands, and flag any blockers (e.g., missing env vars).
