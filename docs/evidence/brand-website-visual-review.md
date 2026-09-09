# Brand website candidate visual review

- Review date: 2026-09-09
- Governance input: `d8b4e37b617a6a112f34fb41529fc9f8e8565d07`
- UI input: `26385ce0e403e38fd70b32afd14e8ebf8b6156a3`
- Website base: `40f1e96c3be60b64eca6b96bc5f644555dc5a637`
- Publication status: not published

## Automated evidence

The guarded local preview produced five files from the two upstream worktrees without copying their
canonical sources into this repository. Playwright executed Chromium, Firefox, WebKit, Chromium
without JavaScript, reduced motion and forced colors: 25 scenarios passed and five redundant visual
captures were skipped by design.

The suite proved the canonical tension and promise, three proof panels, a non-empty exhaustive fleet
table, zero script elements, zero remote resource requests, visible keyboard skip navigation, no
document overflow at 640 px and 320 px, and absence of the unapproved figurative asset from every
public page.

## Human inspection

The disposable Chromium capture was inspected after the green run:

- the provocation precedes the promise and dominates the first viewport;
- proof cards expose mechanism, source, date and limitation without hover or JavaScript;
- product density is high because the complete fleet is shown, but grouping keeps the catalogue
  navigable and the exhaustive table remains a separate factual view;
- the four factory steps remain visually distinct without gradients or decorative node graphs;
- the generated martinet is absent and the brand guide states why it is withheld.

The full-page capture compresses text when viewed as one image; this is not the browser reading size.
The 320 px E2E check guards actual reflow. This review is not a WCAG certification and does not
replace screen-reader or trademark clearance.

## Reproduction

```sh
bun run preview:brand -- --governance-root "$GOVERNANCE_ROOT" --ui-root "$UI_ROOT"
bun run test:e2e:brand-local
```

`@playwright/test` 1.61.1 is Apache-2.0 local-only test tooling. It adds no runtime request, account,
hosted service or published browser binary.
