**English** · [Français](README.fr.md)

> [!NOTE]
> **Reserved · future home of Website** — rebuilt in the canonical base repository [`libre-ai/libre-ai`](https://github.com/libre-ai/libre-ai) ([multi-repo topology, ADR-0008](https://github.com/libre-ai/libre-ai/blob/main/docs/adr/0008-multi-repo-target-topology-and-brand.md)).
> This repository will reopen as the real product repository when the owner activates it, consuming the base as a versioned dependency. The foundations described below are **being built now** — with links to the code that already exists.

# Website

**Public, citable projection of reviewed Libre AI knowledge, products and evidence.** A static, tracking-free site that accepts only reviewed canonical inputs. Readers follow stable URLs to current product state and source dates; contributors propose improvements via GitHub; crawlers receive machine-readable metadata for indexing without fingerprinting.

The canonical brief it answers: _"give the public read-only access to current product truth, complete with sources, review dates and evidence links, without analytics or personal data."_

## Why it's different

- **Deterministic and static.** Build outputs are content-addressed; identical inputs always produce identical releases. Readers never hit a changing runtime — the entire static surface is reproducible and auditable, never a model's opinion.
- **Reviewed only.** Only selected, approved content from Git reaches publication. No unreviewed drafts on public origins; no CMS-authored truth.
- **Tracking-free and sovereign.** No analytics, fingerprinting, or behavioral cookies. Search is self-hosted (Pagefind). No external dependencies in the rendered HTML.
- **Citable and sourced.** Every claim carries authorship, assistance, sources, review date and correction history. Readers export, cite and verify before use.
- **Accessible by design.** Semantic HTML works without JavaScript. Keyboard, zoom 200/400%, reduced motion, high contrast and three browser engines are tested. Search failure leaves a navigable sitemap.

## Status — spec-published, foundations under construction

Website is being rebuilt from locked contracts. It is **not released yet**; the static compilation and projection core come first, and a good part of it already exists and is proven in the base repository:

| Foundation                                                       | State       | Evidence                                                                                                                                                          |
| ---------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract suite** — Knowledge Object, Public Projection, Feeds  | ✅ locked   | CDC approved and merged; canonical schemas under `contracts/schemas/` ([#209](https://github.com/libre-ai/libre-ai/pull/209))                                     |
| **Corpus compiler** — select, validate and de-duplicate content  | ✅ defined  | Refusal matrix, validation logic, event schema ([`docs/apps/website.md`](https://github.com/libre-ai/libre-ai/blob/main/docs/apps/website.md))                    |
| **Static template** — accessible Bun.serve shell                 | ✅ designed | HTML semantics, CSS tokens, keyboard/zoom/motion (design locked in [`docs/apps/website.md`](https://github.com/libre-ai/libre-ai/blob/main/docs/apps/website.md)) |
| **Route projection** — deterministic build, feed and search JSON | ⏳ next     | Bun template instantiation, Pagefind indexing, RSS/Atom generation                                                                                                |
| **Publication pipeline** — source-validated → rendered → smoke   | ⏳ next     | Candidate builds, integrity checks, approval gate                                                                                                                 |
| **Browser and accessibility gates** — Chromium/Firefox/WebKit    | ⏳ next     | CSP, remote-request budget zero, no-JS keyboard, zoom and contrast tests                                                                                          |

This repository is archived and read-only until wave 4 activation. **No benchmark target** — this is the organization's own public projection, not a parity goal against another vendor's site. The measure of success is complete, honest, tracking-free projection of reviewed knowledge.

## What it projects

Website consumes:

- **Hub corpus** — reviewed knowledge objects under `ecosystem/` and `contracts/` in the base repository.
- **Product projections** — capability and state for each product from the inventory (`docs/apps/*.md`).
- **Forge evidence** — authorship, review dates, approval states and correction records from Git.

And publishes:

- **Static routes** — product pages, onboarding, FAQ, canonical URLs with source dates and evidence links.
- **Machine-readable metadata** — Atom/RSS feeds, sitemap with change dates, JSON schema projections for crawlers.
- **Search index** — self-hosted Pagefind, no external search API.
- **Correction history** — version and audit trail for each corrected claim.

## How it works

1. **Compile** — select canonical objects from Git (docs, contracts, inventory), validate completeness and provenance, and freeze a content-addressed snapshot.
2. **Render** — template the snapshot into HTML routes, Atom feeds, sitemaps and search metadata using deterministic, capability-free components.
3. **Smoke-verify** — test all internal links, canonical URLs, redirects, accessibility gates (keyboard, zoom, high contrast) and CSP, then require human approval before release.
4. **Publish** — atomically replace the complete static artifact. Readers get the new release or the prior release — never a partial or intermediate state.
5. **Correct** — accept propositions via GitHub issue/PR. Approved corrections are a new render, re-verified and republished; past evidence remains auditable.

## Architecture — projection from interoperable contracts

Website is a transverse projection layer, not a domain engine. It consumes contracts and produces public surfaces from reviewed selections.

| Component                                   | Role                                       | Interface it exposes / consumes                                                                                    |
| ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Contract suite** (locked schemas)         | Interoperability surface                   | Knowledge Object v1, Public Projection v1, Correction Record v1                                                    |
| **Corpus compiler** (validation, selection) | Source-to-snapshot pipeline                | Reads Git objects, validates against schema, emits content-addressed snapshot                                      |
| **Bun static template** (React 19 SSR)      | Accessible HTML shell, metadata generation | Renders snapshots to deterministic static HTML, Atom feeds, sitemaps, search JSON                                  |
| **Pagefind indexer** (offline self-hosted)  | Search surface                             | Builds search index from rendered HTML without network calls; emits WASM-powered search.json                       |
| **Publication gate** (integrity + approval) | Candidate → release transition             | Validates builds are identical, all internal links resolve, accessibility gates pass, then requires human approval |

The authorizing host passes canonical snapshot bytes to the renderer; the renderer holds no token and reaches no external network. Any consumer that speaks the same contracts can project the same snapshot.

## Where the work happens

All active development is in the base repository, under:

- `apps/website` — the static template, publication CLI and server shell (to be scaffolded).
- `contracts/schemas/` — Knowledge Object, Public Projection and Correction Record definitions.
- `ecosystem/repositories.v1.yaml` — the authoritative product inventory and exposure states.
- `docs/apps/website.md` — the full product brief.

To follow progress or contribute, open issues and pull requests in [`libre-ai/libre-ai`](https://github.com/libre-ai/libre-ai). This repository stays reserved until activation.

## Non-goals and refusals

Website deliberately **refuses** to:

- Author product truth in UI (only from reviewed Git).
- Proxy product applications or claim they are available based on repository existence.
- Accept anonymous or unreviewed content mutations.
- Collect analytics, fingerprints, behavioral tracking or personal data.
- Use external CDNs, remote fonts or unvetted third-party JavaScript.
- Preview unreviewed drafts on public origins.

Any one of these refusals prevents a candidate build from releasing. The refusal matrix is complete and testable.

## Contracts

- Knowledge Object v1 — `ecosystem/schemas/knowledge-object.schema.json`
- Public Projection v1 — `contracts/schemas/public-projection.v1.schema.json`
- Correction Record v1 — `contracts/schemas/correction-record.v1.schema.json`
- Public read API — `contracts/openapi/website.v1.yaml`

## License

EUPL-1.2.
