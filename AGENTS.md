# Website Canonical Agent Rules

## Purpose

Static publisher for the public, citable projection of Libre AI: readers get the real state of each project, its limits and its proofs, at stable URLs — no tracking, no accounts. Distribution surface, couche-1.
Doctrine lives upstream: https://raw.githubusercontent.com/libre-ai/governance/main/docs/README.md

## Domain doctrine

- The homepage project-status table is generated from the pinned fleet-status projection (governance fiches). The site never declares state by hand and never claims more than the fleet's published state.
- Comparisons are factual, dated and sourced; every page gets a stable citable URL, plus machine feeds (sitemap, Atom).
- Non-goals are hard: no product truth authored in this repo, no accounts, no comments, no analytics or behavioral tracking, no CMS or draft preview on public origins.
- Bricks and contracts this repo depends on (`@libre-ai/governance`, `@libre-ai/contracts-authority`) are consumed as SHA-pinned git-deps, never redefined here.

## Commands

- `bun install --frozen-lockfile`
- `bun test`
- `bun run lint` and `bun run typecheck`
- `bun run check` — aggregate gate (toolchain, build, secret-scan, personal-data, lint, typecheck, test); run before pushing

## Working here

- Security > quality > performance > completeness, in that order on conflict.
- Check real state before editing: `git status --short` and `bun test`.
- English for code, comments and this file; French stays the human conversation language elsewhere.
- Never commit a machine-local absolute filesystem path; use repo-relative paths or `~` instead.
