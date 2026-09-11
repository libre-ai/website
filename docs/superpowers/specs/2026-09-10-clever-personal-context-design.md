# Personal Clever Cloud Context Boundary

## Status

Approved intent: every Clever Cloud operation initiated from the Libre AI Website repository uses
the owner's personal Clever account. The expected email is sensitive local configuration and is
never committed, printed, or included in test fixtures.

## Problem and incident classification

The machine-wide Clever Tools configuration selects a non-personal account. A direct global
`clever` command can therefore query or mutate the wrong context even when the Git repository is
personal. The earlier investigation exposed non-secret professional account and application
metadata only inside the private agent session. No resource, configuration, deployment, domain,
repository remote, credential, or source file was mutated. No professional or personal identifier
is retained in the repository.

## Security invariants

1. Tracked files contain no Clever token, secret, account email, user ID, owner ID, application ID,
   or machine-local absolute path.
2. Credentials, identity policy, binding, `HOME`, XDG config, cache, and data roots are isolated
   beneath `~/.config/libre-ai/clever/`.
3. The active profile is exactly `libre-ai-personal`; its email equals the locally enrolled value,
   its token is valid, and 2FA is enabled.
4. The only owner is the authenticated user's ID. Organization-owned targets are refused.
5. Environment variables cannot override credentials, endpoints, TLS verification, Git context,
   application binding, proxy routing, or runtime state roots.
6. The repository-pinned Clever Tools version is invoked through the current absolute Bun binary;
   caller-controlled `PATH` is never used for Clever or quality gates.
7. The binding contains exactly one `libre-ai-website-staging` application with alias
   `website-staging`, type `static`, region `par`, and the exact HTTPS and SSH Git endpoints emitted
   by Clever Tools 4.11.
8. No caller-supplied owner, application, alias, endpoint, credential, force, or transport argument
   is forwarded.
9. Captured provider output is bounded and never forwarded. Printable diagnostics contain no
   profile payload, email, ID, token, or secret.
10. Direct global Clever invocation remains unsupported and outside repository enforcement.
11. Personal application inventory comes only from `GET /v2/self/applications`; no organization
    inventory or account-wide ID resolution is allowed. Every bound Clever command targets the
    locally validated alias, never a caller-provided or remotely resolved application ID.

## Guard architecture

`tools/clever/personal.ts` exposes only `doctor`, `login`, `create-staging`, `deploy-staging`,
`status`, `activity`, `stop-staging`, and `rollback-staging`. Pure parsing and policy checks live in
`tools/clever/context.ts`; subprocess, environment, filesystem, and atomic-write controls live in
`tools/clever/runtime.ts`.

The local state is:

```text
~/.config/libre-ai/clever/
├── clever-tools.json                  # OAuth credentials, 0600
├── context.json                       # expected identity and owner, 0600
├── website-staging.json               # validated Clever binding, 0600
├── home/                              # isolated HOME, 0700
├── xdg-config/                        # Clever features and ID cache root, 0700
├── xdg-cache/                         # isolated cache root, 0700
└── xdg-data/                          # isolated data root, 0700
```

The repository never uses `.clever.json`. Final files and every parent component are checked for
ownership, exact permissions, regular-file type, and symbolic links. Guard-owned writes use a
temporary sibling plus atomic rename. Credential and candidate files are atomically pre-created at
`0600` before Clever Tools can write them, so its in-place JSON writer cannot introduce a
permissive creation window.

Every Clever subprocess receives fixed credentials and binding paths, fixed `HOME` and XDG roots,
an inert global/system Git configuration, no Git prompt, a minimal fixed `PATH`, and scrubbed
credential, endpoint, TLS, proxy, loader, Git, and Node overrides. Clever's own feature and ID-cache
modules derive their paths from the isolated XDG root.

The pinned official Clever client signs one bounded request to
`https://api.clever-cloud.com/v2/self/applications` with the validated isolated credentials. The
request refuses redirects and the JSON response is size-bounded and parsed from `unknown`. This
explicit Personal Space endpoint replaces Clever Tools 4.11's organization-only application list.
The guard never invokes `clever curl`, whose inherited executable and output channel are unsuitable
for this boundary.

## Enrollment

The operator supplies the expected email through a hidden shell read. The guard creates protected
state roots, runs `clever login --alias libre-ai-personal` against the isolated credential file,
validates the returned profile and 2FA, then atomically records the authenticated user ID as the only
allowed owner. The email environment variable is removed before every child process. No
machine-wide Clever file is read or changed.

## Staging creation

Creation first requires a clean `main` exactly equal to fetched `origin/main`, then green aggregate
and browser gates. The command fixes type `static`, region `par`, name, and alias, while deliberately
omitting `--org`: Clever therefore creates through `/self`, and the guarded inventory verifies that
the result belongs to the authenticated Personal Space.
It writes into a protected candidate binding, validates the actual Clever Tools 4.11 binding and
remote inventory, explicitly sets and reads back:

- `CC_BUILD_COMMAND=true`, preventing static-generator auto-detection;
- `CC_STATIC_SERVER=caddy`;
- `CC_WEBROOT=/site`;
- health checks for `/`, `/comparaisons.html`, and `/marque.html`.

Only then is the binding atomically promoted. Any failure after remote creation deletes the unique
just-created application. A non-zero or malformed create response is reconciled against the remote
inventory; ambiguous state fails closed for manual verification. Rollback first writes a canonical
candidate binding, deletes through `--alias website-staging`, verifies absence through `/self`, and
only then removes the candidate.

## Deployment and smoke

Deployment repeats the synchronized-Git and quality gates. Clever Tools 4.11 deploys through its
HTTPS/OAuth Git endpoint, not the binding's SSH endpoint. The guard therefore creates a private
local clone with no hard links, runs pinned `clever deploy` inside it, and removes it before return.
The provider may add a remote only inside that disposable clone; the working repository remains
unchanged. This also avoids first-connection SSH trust-on-first-use while keeping credentials inside
the isolated Clever process.

All Clever operations after binding use `--alias website-staging`, which resolves owner and
application directly from the protected local binding without consulting account-wide summary
metadata. After provider success, the guard queries domains by that alias and accepts
exactly one root `*.cleverapps.io` URL. Smoke requests forbid redirects, credentials, referrers,
remote assets, executable markup, oversized bodies, wrong content types, missing page markers, and
missing security headers. Failure triggers an application stop; inability to verify that stop is
reported explicitly. A stopped label is accepted only when no deployment remains in progress.
Provider logs are never exposed.

Rollback accepts only an explicit full SHA that resolves to a commit in fetched canonical `main`.
It requires the same clean synchronized repository and green quality gates as deployment. Restart
failure, unsafe domain discovery, or any failed three-route smoke triggers the same verified stop;
the rollback is successful only after the public result passes the complete smoke contract.

The tracked `site/` tree is byte-identical to `buildProductionSite()` and is served by the root
`Caddyfile`. The explicit no-op build command avoids executing the provider's older Bun while retaining the
repository's Bun 1.4 floor for generation and verification. Generated `site/` output is excluded
from source linting but is covered by byte-equality, source lint, security, and browser tests.

## Tests and acceptance

- Tests use only reserved identities and domains and model the real Clever Tools 4.11 binding.
- Wrong identity, owner, 2FA, URL, zone, type, mode, symlink, environment, repository, branch,
  revision, gate, domain, header, or page content fails closed.
- Subprocess streams are bounded; errors and outputs are redaction-tested.
- Dependency licenses are compatible and `bun audit` reports no known vulnerability.
- Unit, coverage, licensing, personal-data, secret, type, lint, build, and Playwright gates must all
  pass before merge or deployment.
- A real-account `doctor` may run only after interactive personal login and must emit a redacted
  PASS without reading the global profile.

## Non-goals

- No production application or canonical domain.
- No organization-owned Clever target.
- No reuse, logout, inspection, modification, or remediation of the professional Clever profile.
- No organization inventory or account-wide audit beyond the explicit Personal Space inventory.
- No claim that the repository can prevent deliberate bypass from an unrelated shell.
