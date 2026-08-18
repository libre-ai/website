# Website Canonical Agent Rules

## Authority

Static publisher for the public, citable projection of Libre AI: readers get the real state of each project, its limits and its proofs, at stable URLs — no tracking, no accounts. Active application in the transverse layer of the constellation.
Doctrine lives upstream: https://raw.githubusercontent.com/libre-ai/governance/main/docs/README.md

## Boundaries

- Product truth is never authored here: the homepage status table is generated from the pinned fleet-status projection (governance fiches), never declared by hand, and never claims more than the fleet's published state.
- Governance doctrine and fiches live in `libre-ai/governance`; contract shapes are canonical in `libre-ai/contracts` — both consumed as SHA-pinned git-deps, never redefined here.
- No accounts, comments, analytics, behavioral tracking, CMS or draft preview on public origins.
- The full specification lives in `docs/apps/website.md` (governance-locked CDC); repository state lives in `project.v1.yaml` — this file duplicates neither.

## Quality gates

Run `bun run check` before pushing; never hide a red test.

## Agents

- Check real state before editing: `git status --short` and the aggregate gate above.
- English for code, comments and this file; French stays the human conversation language elsewhere.
- Never commit a machine-local absolute filesystem path; use repo-relative paths or `~` instead.
- Security > quality > performance > completeness, in that order on conflict.
