**English** · [Français](README.fr.md)

> [!NOTE]
> **Active application, regularized by owner signature.** This repository activated de facto — seven pull requests merged before any owner act — and [ADR-0020](https://github.com/libre-ai/governance/blob/main/docs/adr/0020-general-activation-and-hub-dismantling.md) §2.4 regularizes that activation nominatively: the ADR's signature _is_ the act. The static publisher already builds the homepage and eight dated comparisons from the code in this repository, CI green (see `project.v1.yaml`). It is not yet deployed to a public URL, and the full CDC (`docs/apps/website.md`) — the remaining reader journeys — is still to be served.

# Website

**Public, citable projection of reviewed Libre AI knowledge, products and evidence.** A static, tracking-free site that accepts only reviewed canonical inputs. Readers follow stable URLs to current product state and source dates; contributors propose improvements via GitHub; crawlers receive machine-readable metadata for indexing without fingerprinting.

The canonical brief it answers: _"give the public read-only access to current product truth, complete with sources, review dates and evidence links, without analytics or personal data."_

## Why it's different

- **Deterministic and static.** Build outputs are content-addressed; identical inputs always produce identical releases. Readers never hit a changing runtime — the entire static surface is reproducible and auditable, never a model's opinion.
- **Reviewed only.** Only selected, approved content from Git reaches publication. No unreviewed drafts on public origins; no CMS-authored truth.
- **Tracking-free and sovereign.** No analytics, fingerprinting, or behavioral cookies. Search is self-hosted (Pagefind). No external dependencies in the rendered HTML.
- **Citable and sourced.** Every claim carries authorship, assistance, sources, review date and correction history. Readers export, cite and verify before use.
- **Accessible by design.** Semantic HTML works without JavaScript. Keyboard, zoom 200/400%, reduced motion, high contrast and three browser engines are tested. Search failure leaves a navigable sitemap.

## Status — specified, first projection built and CI-green

Website's first-projection phase (γ 3.6) is **accepted**: the homepage table (generated from the pinned fleet-status projection, never hand-declared) and the eight dated comparisons build and pass CI in this repository — see `project.v1.yaml` and the run evidence it cites. The full CDC (understand, verify, contribute, discover journeys) remains pending, and nothing here is deployed to a public URL yet:

| Foundation                                                       | State              | Evidence                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract suite** — Knowledge Object, Public Projection, Feeds  | ✅ locked          | CDC approved and merged; canonical schemas under `contracts/schemas/` in [`libre-ai/contracts`](https://github.com/libre-ai/contracts) ([hub PR #209](https://github.com/libre-ai/libre-ai/pull/209), historical) |
| **Homepage table** — generated from the fleet-status projection  | ✅ built, CI-green | `src/build.ts`; `project.v1.yaml` first-projection phase, criterion `homepage-table`, accepted                                                                                                                    |
| **Eight dated comparisons** — sourced and dated                  | ✅ built, CI-green | `src/comparisons.ts`; `project.v1.yaml` first-projection phase, criterion `dated-comparisons`, accepted                                                                                                           |
| **Full CDC journeys** — understand, verify, contribute, discover | ⏳ pending         | [`docs/apps/website.md`](docs/apps/website.md); `project.v1.yaml` cdc phase, criterion `cdc-journeys`, pending                                                                                                    |
| **Public deployment** — a live URL readers can browse            | ⏳ pending         | `dist/` builds and is verified in CI; not yet published anywhere                                                                                                                                                  |
| **Browser and accessibility gates** — Chromium/Firefox/WebKit    | ⏳ pending         | CSP, remote-request budget zero, no-JS keyboard, zoom and contrast tests                                                                                                                                          |

This repository is active (ADR-0020 §2.4), not reserved and not archived; the README is kept current, and pull requests land here directly (issues are disabled). **No benchmark target** — this is the organization's own public projection, not a parity goal against another vendor's site. The measure of success is complete, honest, tracking-free projection of reviewed knowledge.

## What it projects

Website consumes:

- **Fleet corpus** — reviewed knowledge objects under `ecosystem/` in [`libre-ai/governance`](https://github.com/libre-ai/governance) and `contracts/` in [`libre-ai/contracts`](https://github.com/libre-ai/contracts).
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

Active development is in this repository:

- `src/build.ts`, `src/comparisons.ts` — the static template and comparisons compiler.
- `dist/` — the CI-built, content-addressed output (`index.html`, `comparaisons.html`).
- `docs/apps/website.md` — the full product brief, migrated from the (now archived) hub.
- `project.v1.yaml` — the authoritative state card; the generated section below never drifts from it.

Contracts stay canonical in [`libre-ai/contracts`](https://github.com/libre-ai/contracts) (Knowledge Object, Public Projection, Correction Record), and the fleet-status projection is pinned from [`libre-ai/governance`](https://github.com/libre-ai/governance) — this repository consumes both, it does not fork them.

To follow progress or contribute, open pull requests directly in `libre-ai/website` (issues are disabled).

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

Licences are declared per path through [`REUSE.toml`](REUSE.toml):

- CC-BY-4.0 — the documentation (READMEs)
- EUPL-1.2 — the workflows under `.github/` and the repository configuration

Full licence texts are in [`LICENSES/`](LICENSES). Copyright (c) 2026 Libre AI contributors. The canonical licensing policy is [libre-ai/libre-ai/LICENSING.md](https://github.com/libre-ai/libre-ai/blob/main/LICENSING.md).

## État du projet

<!-- libre-ai:project-status:begin -->
<!-- Section générée depuis project.v1.yaml — ne pas éditer à la main. -->

- Situation actuelle : Le publieur statique rend la page d'accueil (tableau d'état de la constellation depuis la projection fleet-status épinglée) et les huit comparaisons datées, chaîne verte en CI réelle ; le CDC complet (docs/apps/website.md, migré du hub) reste à servir.
- Maturité : specified
- Exposition : spec-published
- Confiance : medium
- Preuves vérifiées le : 2026-07-30
- Avancement : 50 % du périmètre actuellement déclaré

<!-- libre-ai:project-status:end -->

La fiche [`project.v1.yaml`](./project.v1.yaml) est l autorité de l état du projet ; cette section en est générée et le gate de flotte échoue si elles divergent.
