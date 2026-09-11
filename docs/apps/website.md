# Website

- **Path:** `apps/website`
- **Owner:** Experiences / Website
- **Runtime:** Bun.serve, React 19 SSR and deterministic static publisher
- **Tenant model:** public, no account

## Purpose and actors

Website is the public, citable projection of reviewed Libre AI knowledge, product records and evidence. Readers, contributors and search/index clients are actors; only reviewed canonical inputs can affect publication.

## Journeys

1. **Understand:** reader opens a static/SSR route, sees current product state, limits, source date and evidence links, then follows a stable canonical URL.
2. **Verify:** reader opens a claim or corpus item, inspects authorship, assistance, sources, review date and corrections, then exports/cites it.
3. **Contribute:** contributor follows versioned contribution rules to a GitHub proposal; Website itself accepts no anonymous content mutation.
4. **Discover:** standards-compliant crawlers receive sitemap, robots, Atom/RSS and machine-readable metadata generated from the same selected corpus.

## Non-goals

- product truth authored in UI ;
- account, profile, comments, analytics fingerprinting or behavioral tracking ;
- CMS or unreviewed draft preview on public origins ;
- proxying product applications ;
- claiming availability from repository existence.

## Domain protocol

**Commands:** `CompilePublicCorpus`, `PublishStaticCandidate`, `InvalidateSearchProjection` (build/release operators only).

**Queries:** `GetPage`, `SearchPublicCorpus`, `GetFeed`, `GetSitemap`, `GetProductProjection`, `GetCorrectionHistory`.

**Events:** `PublicCorpusCompiled`, `StaticCandidatePublished`, `PublicProjectionRejected`, `SearchProjectionBuilt`.

Publication is an offline candidate transition: `source-selected → validated → rendered → smoke-verified → approved → published`. Runtime requests never mutate canonical content.

## Refusal matrix

| Code | Refusal |
| --- | --- |
| `website.source_unreviewed` | selected object lacks accepted review state |
| `website.claim_unsourced` | normative/factual claim lacks required source |
| `website.route_collision` | two selected objects map to one canonical route |
| `website.metadata_divergence` | HTML/feed/sitemap metadata disagree |
| `website.remote_asset` | rendered output references a non-approved remote asset |
| `website.non_deterministic` | second build from same inputs differs |
| `website.publication_unapproved` | human publication approval absent |
| `website.release_context_unsafe` | release identity, owner, 2FA, isolated Clever state or local Git state is not the enrolled personal context |
| `website.release_candidate_unverified` | aggregate, browser or post-deploy smoke evidence is red |

Any one refusal prevents the complete candidate from replacing the current static release.

## Data

Authority is the reviewed Knowledge Object graph and versioned public content under Git. Local build outputs are disposable; the `site/` deployment projection is versioned only to preserve the verified artifact across a provider toolchain mismatch and must remain byte-identical to generator output. No personal data or runtime database is owned. Search indexes contain public text only. Migration source is accepted Website/corpus specifications and selected assets from archived SHAs, never a database dump.

## Authentication and authorization

Public reads require no session. Publication runs under a GitHub release identity and later an attenuated internal release Biscuit with `tenant("public")`, restricted to `resource("website-release")`, `operation("publish")`, candidate hash and expiry. No browser Biscuit or admin route exists.

## Runtime boundaries

Bun owns HTTP/static generation, React rendering and feed/search adapters. No Rust runtime is justified in v1. Website reads only compiled contracts; it never queries product tables. Pagefind runs as an offline self-hosted indexer.

## Accessibility and degraded mode

Semantic HTML works without client JavaScript. Keyboard, visible focus, zoom 200/400%, reduced motion, high contrast, language metadata and three browser engines are mandatory. Search failure leaves a navigable sitemap and direct URLs. Product application outage does not remove its descriptive page; CTA becomes unavailable with dated status.

## Contracts

- Knowledge Object v1 — `ecosystem/schemas/knowledge-object.schema.json` ;
- Public Projection v1 — `contracts/schemas/public-projection.v1.schema.json` ;
- Correction Record v1 — `contracts/schemas/correction-record.v1.schema.json` ;
- public read API — `contracts/openapi/website.v1.yaml`.

## Evidence

- unit: escaping, route selection, metadata, correction ordering ;
- contract: positive/negative corpus and projection fixtures ;
- integration: build twice and compare hashes, Pagefind index, feeds/sitemap ;
- E2E: Chromium/Firefox/WebKit, keyboard and no-JS ;
- security: CSP, remote-request budget zero, dependency/license scans ;
- smoke: all required files, redirects and canonical URLs.

## Work packages

1. contract fixtures and corpus compiler — Canonical Core ;
2. static Bun template and accessible shell — Web Platform ;
3. route/feed/search projections — Experiences ;
4. deterministic/browser/security gates — Infrastructure and Release.

Packages 1–2 can proceed in parallel after contract approval; 3 depends on both; 4 qualifies the integrated candidate.

## Release and rollback

Release requires identical clean builds, zero broken internal links, browser/accessibility evidence, source-policy checks and human approval. Static artifacts are content-addressed. Rollback atomically restores the previous complete artifact; partial route rollback is forbidden.

Clever Cloud release operations use only the repository's guarded personal-context entry point. The guard isolates credentials, `HOME`, XDG state and caches from machine-wide configuration; requires the authenticated user's Personal Space, enabled 2FA, a clean synchronized `main`, and fixed application arguments; and deploys through pinned Clever Tools from a disposable private clone so the working repository gains no personal remote. Only a static Paris staging target is currently permitted. The versioned `site/` artifact must equal generated production output byte-for-byte and is served by the reviewed Caddyfile with fixed security headers; this avoids building with a provider Bun version below the repository floor. Production, organization-owned targets, provider logs and direct global `clever` commands remain refused. A failed post-deploy smoke stops staging. Rollback accepts one explicit 40-character commit only after proving that it belongs to canonical `main`; it repeats the repository and quality gates, smoke-verifies the public result, and stops staging if restart or smoke fails.

Remote verification is restricted to `GET /v2/self/applications`, signed with the isolated personal credentials and parsed under a bounded response limit. It never requests organization inventory. Bound Clever commands use only the protected local `website-staging` alias, preventing Clever Tools from resolving application IDs through account-wide summary metadata.
