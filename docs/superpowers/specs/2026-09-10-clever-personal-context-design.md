# Personal Clever Cloud Context Boundary

## Status

Approved intent: every Clever Cloud operation initiated from the Libre AI Website repository must use the owner's personal Clever Cloud account. The expected email is sensitive local configuration and must never be committed, printed, or included in test fixtures.

## Problem

The machine-wide Clever Tools configuration currently selects a non-personal account. Clever Tools also permits a shared default SSH key and global active-profile switching. Running the global `clever` executable from the Website repository can therefore query or mutate the wrong account even though the Git repository itself is personal.

The earlier investigation produced a contained confidentiality incident: non-secret account and application metadata from the non-personal context entered the current agent session. No application, add-on, configuration, domain, deployment, repository remote, credential, or source file was created or changed. The repository must not retain the incident's email addresses, owner IDs, application IDs, or application names.

## Security invariants

1. The tracked repository contains no Clever token, secret, account email, user ID, owner ID, application ID, or machine-local absolute path.
2. The personal Clever credentials, expected identity, application binding, and SSH private key are separate from every machine-wide or professional configuration.
3. The expected profile email must match the locally enrolled personal identity exactly.
4. The selected owner must equal the authenticated personal user's ID. Organization-owned targets are refused.
5. Two-factor authentication must be enabled before any application mutation or deployment.
6. Incoming environment variables cannot override the credential file, API endpoints, application binding, or SSH identity.
7. Deployment uses a dedicated Ed25519 key with `IdentitiesOnly=yes`; the default SSH key is never offered.
8. Commands target only the bound Website application. Arbitrary `--org`, `--owner`, `--app`, `--alias`, credential, endpoint, force, or SSH overrides are refused.
9. Every refusal is safe to print and contains no token, secret, email address, or raw profile payload.
10. Direct invocation of the global `clever` executable is outside repository enforcement. Repository documentation and automation expose only the guarded entry point and never install a shared Clever remote.

## Architecture

### Tracked guard

`tools/clever/personal.ts` is the only supported repository entry point. It exposes a small allowlist of high-level operations instead of forwarding arbitrary Clever Tools arguments:

- `doctor`: read-only validation of the repository, isolated files, authenticated profile, 2FA, personal owner, and dedicated SSH key.
- `login`: authenticate into the isolated credential file only, then require `doctor` before continuing.
- `create-staging`: create and bind one static Paris application in the authenticated user's Personal Space.
- `status`, `activity`, and `logs`: read the bound staging application only.
- `deploy-staging`: require a clean `main`, green local gates, the exact personal context, and the dedicated SSH identity before deployment.
- `stop-staging` and `rollback-staging`: explicit recovery operations against the same bound application.

Production creation and deployment are not part of this change. They require a separate explicit production decision.

### Pure policy core

`tools/clever/context.ts` owns parsing and policy decisions without spawning processes. It validates typed profile, local policy, application binding, repository state, and requested operation inputs. It returns explicit errors rather than throwing untyped values or terminating the process.

The expected email remains in a local policy document so the tracked code and fixtures never reproduce personal data. Tests use reserved `example.test` identities.

### Local state

The guard derives one fixed directory beneath the current user's configuration directory:

```text
~/.config/libre-ai/clever/
├── clever-tools.json       # personal OAuth credentials, mode 0600
├── context.json            # expected email and enrolled user ID, mode 0600
└── website-staging.json    # Clever application binding, mode 0600
```

The directory must be mode `0700`. A less restrictive directory or sensitive file mode is a hard refusal. The repository does not use `.clever.json`.

The SSH identity is stored separately:

```text
~/.ssh/libre_ai_clever_personal_ed25519
~/.ssh/libre_ai_clever_personal_ed25519.pub
```

The setup flow creates the key only when absent and never overwrites an existing key. Registering the public key on the personal account is an explicit external mutation and is reported before execution.

### Process boundary

Every Clever subprocess receives a fresh environment that:

- removes `CLEVER_TOKEN`, `CLEVER_SECRET`, `CONFIGURATION_FILE`, `APP_CONFIGURATION_FILE`, API endpoint overrides, and inherited SSH overrides;
- sets the isolated `CONFIGURATION_FILE` and `APP_CONFIGURATION_FILE` paths;
- sets `GIT_SSH_COMMAND` to the dedicated key with `IdentitiesOnly=yes`;
- disables the update notifier to avoid unrelated writes and warnings.

The guard parses `clever profile --format json`, compares the exact email only in memory, and emits only a boolean identity result. It never prints the email, user ID, owner ID, or raw profile payload.

## Enrollment flow

1. Create the protected local directory.
2. Store the expected personal email in `context.json` with mode `0600`.
3. Run `clever login --alias libre-ai-personal` against the isolated credential file.
4. Read the authenticated profile and refuse a mismatch without printing either email.
5. Require 2FA. If disabled, stop before creating a key, application, or binding.
6. Persist the authenticated user ID as both expected user and allowed owner.
7. Create or verify the dedicated SSH key.
8. Register only that public key on the personal Clever account.
9. Run `doctor`; only a completely green result unlocks application creation.

No step reads the machine-wide Clever configuration after enrollment begins.

## Deployment flow

1. `doctor` validates the personal boundary.
2. The guard verifies the Git root, canonical personal origin, `main`, clean worktree, and equality between local `HEAD` and `origin/main`.
3. The aggregate quality gate and browser tests run before the remote mutation.
4. `create-staging`, when needed, forces type `static`, region `par`, and owner equal to the personal user ID.
5. The returned binding is validated and written atomically with mode `0600`.
6. `deploy-staging` pushes using the dedicated SSH identity and follows deployment activity.
7. Smoke tests target the technical Clever URL. A failed smoke stops the application and reports the previous successful deployment; rollback remains an explicit action.

## Error handling

- Malformed JSON, missing files, permissive modes, identity mismatch, disabled 2FA, wrong owner, wrong application, dirty Git state, red tests, or unsupported arguments fail before mutation.
- Enrollment writes use a temporary sibling file followed by an atomic rename.
- Secrets and emails are represented as redacted values in every diagnostic path.
- Partial enrollment is safe: no application operation is enabled until `doctor` passes all invariants.
- External commands have bounded output capture and preserve their exit status without logging the complete environment.

## Tests

### Unit

- Accept the exact enrolled personal profile and personal owner.
- Reject an email mismatch, missing profile, malformed profile, disabled 2FA, owner different from user, malformed binding, wrong application, and unsafe file modes.
- Reject every credential, endpoint, application, owner, alias, force, and SSH override.
- Verify that error messages contain neither fixture emails nor profile payloads.

### Focused integration

- Use temporary directories, a fake Clever executable, and a fake SSH command.
- Prove that the global credential file and default SSH key are never opened or offered.
- Prove that subprocesses receive only the isolated paths and dedicated SSH command.
- Prove that failed enrollment and failed binding writes leave prior local state intact.

### Repository gates

- Include the new tests in `bun run test` and coverage enforcement.
- Run `bun run check` and the existing Playwright production suite.
- Run secret and personal-data scans over the final diff.

### Personal-context smoke

After interactive login, run `doctor` against the real personal account. The acceptable output is a redacted PASS report showing exact-identity match, 2FA enabled, Personal Space ownership, dedicated SSH identity, and no application mutation yet.

## Documentation

README contributor instructions expose guarded commands only and explicitly refuse the global Clever CLI in this repository. Examples use placeholders and reserved domains; no real personal or professional identifier is committed.

## Non-goals

- No production application or canonical domain.
- No organization-owned Clever target.
- No reuse, logout, modification, or remediation of the non-personal Clever profile.
- No rotation of credentials that were not exposed.
- No account-wide audit system beyond the evidence available from local state and per-application Clever activity.
- No attempt to prevent a human from deliberately bypassing the repository guard in an unrelated shell.

## Acceptance criteria

- The repository contains no personal or professional identity value.
- Every guarded Clever action uses the isolated config, Personal Space owner, and dedicated SSH key.
- Wrong identity, wrong owner, missing 2FA, inherited override, unsafe mode, dirty Git state, and failing gates all refuse before mutation.
- Unit, focused integration, aggregate, browser, secret, personal-data, and licensing gates pass.
- Real-account `doctor` passes without printing the enrolled email or reading the non-personal profile.
- The incident check remains classified as metadata exposure with no detected resource mutation.
