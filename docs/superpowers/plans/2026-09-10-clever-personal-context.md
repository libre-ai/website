# Personal Clever Context Implementation Plan

> Execution record. The matching design document is authoritative for final invariants.

**Goal:** Make supported Website staging operations fail closed unless they use one enrolled
personal Clever identity, Personal Space ownership, isolated process state, enabled 2FA, and the
canonical synchronized Website repository.

**Stack:** Bun 1.4 canary, strict TypeScript, Bun test, Playwright, Clever Tools 4.11, Caddy.

## 1. Characterize and isolate the context

- Record the initial professional-context exposure as non-secret metadata disclosure with no
  detected mutation.
- Keep the real expected personal email local and hidden; use only `example.test` fixtures.
- Pin and invoke Clever Tools through the absolute current Bun executable.
- Isolate credentials, application binding, `HOME`, XDG config, cache, and data roots.
- Refuse credential, endpoint, TLS, proxy, loader, Git, and application overrides.
- Test modes, ownership, symlinks, atomic writes, bounded subprocess output, and redaction.

## 2. Enforce identity and application policy

- Parse all CLI JSON from `unknown` with explicit checks.
- Require profile alias `libre-ai-personal`, exact enrolled email, valid token, 2FA, and owner equal
  to the authenticated user.
- Model the real Clever Tools 4.11 binding: `deploy_url` is the HTTPS Git endpoint and
  `git_ssh_url` is the SSH Git endpoint; neither is the public site URL.
- Allow exactly one fixed static Paris staging application and no arbitrary forwarded arguments.
- Omit `--org` during creation so Clever uses `/self`, then verify Personal Space ownership through
  the guarded inventory.
- Query only the explicit Personal Space `/v2/self/applications` endpoint and use protected local
  aliases for every bound CLI operation so Clever never performs account-wide ID resolution.
- Reconcile partial create failures against remote inventory and delete only a unique newly created
  target; verify remote absence before completing rollback.

## 3. Make the static release reproducible

- Track `site/` as the deployment artifact and verify it byte-for-byte against
  `buildProductionSite()`.
- Provide `sync:deployment-artifact` for intentional regeneration.
- Serve `site/` through a root Caddyfile with fixed security headers.
- Explicitly set and read back `CC_BUILD_COMMAND=true`, `CC_STATIC_SERVER=caddy`,
  `CC_WEBROOT=/site`, and three route health checks during creation.
- Exclude generated `site/` bytes from source formatting while retaining equality, source security,
  browser, secret, personal-data, and licensing checks.

## 4. Guard deployment and recovery

- Require clean `main`, fetched `origin/main`, exact SHA equality, aggregate checks, and Playwright
  before create or deploy.
- Clone the approved revision locally into a private no-hardlink temporary repository.
- Run pinned `clever deploy` there with isolated HTTPS/OAuth credentials, then remove the clone so
  no personal remote enters the working repository.
- Query the public domain separately by validated app ID and accept exactly one root
  `*.cleverapps.io` target.
- Smoke all three routes with bounded bodies, no redirects/credentials/referrer, passive local
  assets, content markers, CSP, COOP, CORP, referrer, nosniff, and frame-denial headers.
- Stop staging automatically after smoke failure and report whether the stop was verified.
- Keep rollback explicit and restricted to one full commit SHA.

## 5. Review and integration gates

- Run formatter, linter, strict typecheck, all unit and coverage gates, secret scan, personal-data
  scan, license scan, dependency audit, deterministic build, and full browser E2E.
- Perform adversarial review after the snapshot is frozen; fix every security/quality blocker and
  rerun the complete gates.
- Ensure every branch commit has a DCO sign-off and no Codex co-author trailer.
- Push, open a PR, require green checks, merge with a signed integration commit, verify local and
  remote trees, then remove the worktree and branch.

## 6. Real personal enrollment and staging

- Preserve before/after metadata digests of the global Clever configuration without reading or
  printing its contents.
- Let the operator enter the personal email and complete OAuth interactively; never inject either
  through captured tool input.
- Run guarded `doctor`; refuse if 2FA is absent.
- Create and deploy staging only from the final merged `origin/main` after all local and remote
  checks are green.
- Record public deployment evidence without email, owner ID, application ID, token, or raw provider
  output.
