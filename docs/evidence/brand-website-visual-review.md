# Brand website production-artifact visual review

- Review date: 2026-09-10
- Governance input: `9ac334cdf86cf05d126091f394d07c01d7745930`
- UI input: `99282032a9c71ca4c30efeb441329144ff95cbf8`
- Starter CTA input: `acccae671aa46419fce9d0b7ff7cbe2511f073a6`
- Website base: `aaa23ca802cac307ab472af9cd8f5bba6bb273cf`
- Publication status: not published

## Automated evidence

The production command produced five files from SHA-pinned git dependencies without copying their
canonical sources into this repository. Two consecutive complete builds produced identical SHA-256
digests. Playwright executed Chromium, Firefox, WebKit, Chromium without JavaScript, reduced motion
and forced colors against `dist/`: 25 scenarios passed and five redundant visual captures were
skipped by design.

The suite proved the canonical tension and promise, three proof panels, a non-empty exhaustive fleet
table, zero script elements, zero remote resource requests, visible keyboard skip navigation, no
document overflow at 640 px and 320 px, and absence of the unapproved figurative asset from every
public page. It also proved that the primary CTA targets the immutable Starter quick-start and that
the adjacent copy says the target is a demonstration, not a production-ready application.

| File | SHA-256 |
| --- | --- |
| `dist/index.html` | `b22347dae46f5651be610f10b4f18baebb6a6653b148ee1b1d35db4eddae1d98` |
| `dist/comparaisons.html` | `2b6a2ae0036df972b640e6a155c0b39e0e0e3ff3349824858d731591d47cac08` |
| `dist/marque.html` | `a4259f5fd13a057e5032ebba5b000b2f85e4e8da880b1e7628da01f31a331bef` |
| `dist/assets/styles.css` | `115ab40246ee7e1f1d0e5ab674d1dce887b3d15a57893e63baf0f14809f0e9f2` |
| `dist/assets/tokens.css` | `f217c338ccb4d243aa9684e7c38e079894582be96e90e9aded7b6c2b3df9a211` |

## Human inspection

The disposable Chromium capture was inspected after the green run:

- the provocation precedes the promise and dominates the first viewport;
- proof cards expose mechanism, source, date and limitation without hover or JavaScript;
- product density is high because the complete fleet is shown, but grouping keeps the catalogue
  navigable and the exhaustive table remains a separate factual view;
- the four factory steps remain visually distinct without gradients or decorative node graphs;
- the Portique d'atelier is absent and the brand guide states why it is withheld;
- the primary action is visually dominant, while its production-readiness boundary remains directly
  adjacent and readable.

The full-page capture compresses text when viewed as one image; this is not the browser reading size.
The 320 px E2E check guards actual reflow. This review is not a WCAG certification and does not
replace screen-reader or trademark clearance.

## Reproduction

```sh
bun run build
bun run test:e2e
shasum -a 256 dist/index.html dist/comparaisons.html dist/marque.html \
  dist/assets/styles.css dist/assets/tokens.css
```

`@playwright/test` 1.61.1 is Apache-2.0 local-only test tooling. It adds no runtime request, account,
hosted service or published browser binary.
