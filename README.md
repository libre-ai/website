**English** · [Français](README.fr.md)

> [!NOTE]
> **Active application, regularized by owner signature.** This repository activated de facto — seven pull requests merged before any owner act — and [ADR-0020](https://github.com/libre-ai/governance/blob/main/docs/adr/0020-general-activation-and-hub-dismantling.md) §2.4 regularizes that activation nominatively: the ADR's signature _is_ the act. The production build now renders the reviewed brand, its proofs, the complete fleet, dated comparisons and an immutable link to the executable starter. It is not yet deployed to a public URL, and the full CDC (`docs/apps/website.md`) remains pending.

# Website

**Public, citable projection of reviewed Libre AI knowledge, products and evidence.** A static, tracking-free site that accepts only reviewed canonical inputs. Readers follow stable URLs to current product state and source dates; contributors propose improvements via GitHub; crawlers receive machine-readable metadata for indexing without fingerprinting.

The canonical brief it answers: _"give the public read-only access to current product truth, complete with sources, review dates and evidence links, without analytics or personal data."_

## Why it's different

- **Deterministic and static.** SHA-pinned inputs produce a complete five-file artifact. Readers never hit an application runtime — the surface is reproducible and auditable, never a model's opinion.
- **Reviewed only.** Only selected, approved content from Git reaches publication. No unreviewed drafts on public origins; no CMS-authored truth.
- **Tracking-free and sovereign.** No analytics, fingerprinting, behavioral cookies, remote fonts or client JavaScript. Search is not shipped yet rather than delegated to an external service.
- **Citable and sourced.** The brand proofs expose their source, review date and limitation; the fleet state comes from the pinned governance projection.
- **Accessible by design.** Semantic HTML works without JavaScript. Keyboard navigation, narrow reflow, reduced motion, forced colors and three browser engines are tested.

## Status — specified, first projection built and CI-green

Website's first-projection phase (γ 3.6) is **accepted**: the homepage table (generated from the pinned fleet-status projection, never hand-declared) and the eight dated comparisons build and pass CI in this repository — see `project.v1.yaml` and the run evidence it cites. The full CDC (understand, verify, contribute, discover journeys) remains pending, and nothing here is deployed to a public URL yet:

| Foundation                                                       | State              | Evidence                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract suite** — Knowledge Object, Public Projection, Feeds  | ✅ locked          | CDC approved and merged; canonical schemas under `contracts/schemas/` in [`libre-ai/contracts`](https://github.com/libre-ai/contracts) ([hub PR #209](https://github.com/libre-ai/libre-ai/pull/209), historical) |
| **Branded production build** — wordmark, proofs, fleet, CTA      | ✅ built, gated    | `src/build.ts`; SHA-pinned Governance/UI inputs; figurative asset forced off                                                                                                                                     |
| **Dated comparisons** — sourced and dated                        | ✅ built, gated    | `src/comparisons.ts`; included in the same complete production artifact                                                                                                                                           |
| **Full CDC journeys** — understand, verify, contribute, discover | ⏳ pending         | [`docs/apps/website.md`](docs/apps/website.md); `project.v1.yaml` cdc phase, criterion `cdc-journeys`, pending                                                                                                    |
| **Public deployment** — a live URL readers can browse            | ⏳ pending         | `dist/` builds and is verified in CI; not yet published anywhere                                                                                                                                                  |
| **Browser and accessibility gates** — Chromium/Firefox/WebKit    | ✅ production gate | Playwright builds and tests `dist/` in six browser/accessibility modes; CI blocks on failure                                                                                                                       |

This repository is active (ADR-0020 §2.4), not reserved and not archived; the README is kept current, and pull requests land here directly (issues are disabled). **No benchmark target** — this is the organization's own public projection, not a parity goal against another vendor's site. The measure of success is complete, honest, tracking-free projection of reviewed knowledge.

## What it projects

Website consumes:

- **Fleet corpus** — reviewed knowledge objects under `ecosystem/` in [`libre-ai/governance`](https://github.com/libre-ai/governance) and `contracts/` in [`libre-ai/contracts`](https://github.com/libre-ai/contracts).
- **Product projections** — capability and state for each product from the inventory (`docs/apps/*.md`).
- **Forge evidence** — authorship, review dates, approval states and correction records from Git.

The current production build publishes:

- **Three static routes** — homepage, dated comparisons and the guarded brand guide.
- **Local style assets** — the pinned UI tokens and styles plus the site-specific layout.
- **Executable hand-off** — the primary CTA links to one immutable starter quick-start and states that it is a demonstration, not a production-ready application.

Search, sitemap, feeds and the remaining understand/verify/contribute/discover journeys belong to the pending full CDC. They are not claimed as current output.

## How it works

1. **Load** — read the SHA-pinned Governance brand/fleet projections and UI style sources from installed git dependencies.
2. **Validate** — reject malformed projections, remote assets and executable HTML/SVG; force the unapproved figurative mark off.
3. **Render** — produce three HTML files and two local CSS files without client JavaScript.
4. **Replace** — stage the complete artifact beside `dist/`, then rename it atomically while preserving the prior directory on failure.
5. **Qualify** — rebuild, run unit and browser gates, and review the generated visual before release.

## Architecture — projection from interoperable contracts

Website is a transverse projection layer, not a domain engine. It consumes contracts and produces public surfaces from reviewed selections.

| Component                                   | Role                                       | Interface it exposes / consumes                                                                                    |
| ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Pinned input loader**                     | Canonical input boundary                   | Reads exact Governance and UI git dependency revisions                                                             |
| **Strict parsers and security guards**      | Refusal boundary                           | Validate projection shapes and refuse remote or executable output                                                   |
| **Bun static templates**                    | Accessible publication surface             | Render deterministic HTML/CSS with no client runtime                                                                |
| **Transactional writer**                    | Candidate → complete local artifact        | Stages every file, removes stale assets and restores the prior artifact on failure                                  |
| **Unit and Playwright gates**               | Release evidence                           | Check behavior plus Chromium, Firefox, WebKit, no-JS, reduced-motion and forced-colors modes                        |

The authorizing host passes canonical snapshot bytes to the renderer; the renderer holds no token and reaches no external network. Any consumer that speaks the same contracts can project the same snapshot.

## Where the work happens

Active development is in this repository:

- `src/build.ts`, `src/comparisons.ts` — the static template and comparisons compiler.
- `dist/` — the complete generated output (`index.html`, `comparaisons.html`, `marque.html` and two CSS assets).
- `docs/apps/website.md` — the full product brief, migrated from the (now archived) hub.
- `project.v1.yaml` — the authoritative state card; the generated section below never drifts from it.

Contracts stay canonical in [`libre-ai/contracts`](https://github.com/libre-ai/contracts) (Knowledge Object, Public Projection, Correction Record), and the fleet-status projection is pinned from [`libre-ai/governance`](https://github.com/libre-ai/governance) — this repository consumes both, it does not fork them.

To follow progress or contribute, open pull requests directly in `libre-ai/website` (issues are disabled).

## Contributor checks

Inside an activated Python virtual environment, install the JavaScript dependencies and the pinned
REUSE requirements before running the aggregate gate:

```sh
bun install --frozen-lockfile
python3 -m pip install --disable-pip-version-check --requirement node_modules/@libre-ai/governance/tools/licensing/requirements.txt
bun run check
bun run test:e2e
```

The unit gate emits an LCOV report under `coverage/` and fails below 90% line or function coverage.

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

- Product and reader-journey contracts remain specified in [`docs/apps/website.md`](docs/apps/website.md).
- The current renderer consumes the pinned public-brand and fleet-status projections from Governance.
- Search, feed and public-read API surfaces remain pending; this repository does not yet expose them.

## License

Licences are declared per path through [`REUSE.toml`](REUSE.toml):

- CC-BY-4.0 — the documentation (READMEs)
- EUPL-1.2 — the workflows under `.github/` and the repository configuration

Full licence texts are in [`LICENSES/`](LICENSES). Copyright (c) 2026 Libre AI contributors. The canonical licensing policy is [libre-ai/libre-ai/LICENSING.md](https://github.com/libre-ai/libre-ai/blob/main/LICENSING.md).

## État du projet

<!-- libre-ai:project-status:begin -->
<!-- Section générée depuis project.v1.yaml — ne pas éditer à la main. -->

- Situation actuelle : Le build de production rend la marque Libre AI, ses preuves, la flotte complète, les comparaisons datées et un accès au starter exécutable. Le mot-symbole reste seul publié : le signe figuratif est refusé tant que ses contrôles ne sont pas acceptés. Aucun déploiement public n'est encore prouvé.
- Maturité : specified
- Exposition : spec-published
- Confiance : medium
- Preuves vérifiées le : 2026-09-10
- Avancement : 50 % du périmètre actuellement déclaré

<!-- libre-ai:project-status:end -->

La fiche [`project.v1.yaml`](./project.v1.yaml) est l autorité de l état du projet ; cette section en est générée et le gate de flotte échoue si elles divergent.
