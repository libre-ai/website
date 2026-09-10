# Personal Clever Cloud Context Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every supported Clever Cloud operation from the Libre AI Website repository fail closed unless it uses the enrolled personal account, Personal Space owner, isolated credentials, dedicated SSH key, and enabled 2FA.

**Architecture:** A pure TypeScript policy module validates untrusted profile, binding, filesystem, Git, and command inputs. A process module constructs a scrubbed environment and runs only explicit subprocesses. A small CLI exposes guarded high-level staging operations; real identity values remain in mode-protected local files outside Git.

**Tech Stack:** Bun 1.4 canary, strict TypeScript, Bun test, Clever Tools 4.11, Git, OpenSSH Ed25519.

**Spec:** `docs/superpowers/specs/2026-09-10-clever-personal-context-design.md`

## Global Constraints

- Never commit or print a Clever token, secret, account email, user ID, owner ID, application ID, or machine-local absolute path.
- The allowed owner is always the authenticated personal user's Personal Space: `ownerId === userId`.
- Two-factor authentication is mandatory before remote or local account mutation.
- `CONFIGURATION_FILE`, `APP_CONFIGURATION_FILE`, API endpoint overrides, Clever token variables, and SSH overrides are scrubbed before spawning Clever Tools.
- Deployment uses only `~/.ssh/libre_ai_clever_personal_ed25519` with `IdentitiesOnly=yes`.
- Production is out of scope; only a Paris static staging application is permitted.
- Every non-trivial behavior is written red-green-refactor and the aggregate gate must stay warning-free.

---

### Task 1: Pure context policy

**Files:**
- Create: `tools/clever/context.ts`
- Create: `tools/clever/context.test.ts`
- Modify: `tsconfig.json`
- Modify: `REUSE.toml`

**Interfaces:**
- Produces: `parseProfile(value: unknown): Result<CleverProfile, ContextError>`
- Produces: `parsePolicy(value: unknown): Result<PersonalContextPolicy, ContextError>`
- Produces: `parseBinding(value: unknown): Result<CleverBinding, ContextError>`
- Produces: `parseRemoteApplications(value: unknown): Result<readonly RemoteApplication[], ContextError>`
- Produces: `validateIdentity(profile, policy): Result<ValidatedIdentity, ContextError>`
- Produces: `validateBinding(binding, identity): Result<ValidatedBinding, ContextError>`
- Produces: `validateOptionalBinding(binding, identity): Result<ValidatedBinding | null, ContextError>`
- Produces: `validateRemoteApplication(applications, identity): Result<RemoteApplication, ContextError>`
- Produces: `redactContextError(error): string`

- [ ] **Step 1: Add strict TypeScript and licence coverage for tools**

Change `tsconfig.json` to include both source roots:

```json
"include": ["src/**/*.ts", "tools/**/*.ts"]
```

Add `tools/**` to the existing EUPL first-party software annotation in `REUSE.toml`.

- [ ] **Step 2: Write failing policy tests**

Create fixtures exclusively under `example.test` and assert explicit failure codes:

```ts
const profile = {
  id: "user_personal_fixture",
  email: "owner@personal.example.test",
  has2FA: true,
  isTokenValid: true,
};

expect(validateIdentity(profile, policy)).toEqual({
  ok: true,
  value: { userId: "user_personal_fixture", ownerId: "user_personal_fixture" },
});
```

Cover malformed input, mismatched email, invalid token, disabled 2FA, `ownerId !== userId`, an absent pre-creation binding, multiple bindings, wrong owner, unsafe aliases, remote non-static applications, and remote applications outside Paris. Assert that rendered errors contain neither fixture email nor raw JSON.

- [ ] **Step 3: Run the focused test and prove RED**

Run: `bun test tools/clever/context.test.ts`

Expected: FAIL because `tools/clever/context.ts` does not exist.

- [ ] **Step 4: Implement explicit result types and parsers**

Use discriminated results and function declarations:

```ts
export interface ContextError {
  code: ContextErrorCode;
  safeMessage: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface CleverProfile {
  id: string;
  email: string;
  has2FA: boolean;
  isTokenValid: boolean;
}

export interface PersonalContextPolicy {
  version: 1;
  expectedEmail: string;
  expectedUserId: string | null;
  expectedOwnerId: string | null;
}
```

Parse `unknown` with explicit object/key checks. Never interpolate rejected values into errors. `validateIdentity` must compare the exact email in memory, require token validity and 2FA, then require enrolled IDs when present. `validateOptionalBinding` accepts an absent binding before application creation; once a binding exists, `validateBinding` must accept exactly one `website-staging` application owned by the validated user with valid Clever HTTPS and SSH URLs. `validateRemoteApplication` independently requires the matching application to have type `static` and zone `par`, because Clever's local binding format carries neither field.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run: `bun test tools/clever/context.test.ts`

Expected: all policy cases PASS.

- [ ] **Step 6: Run type, lint, personal-data, secret, and licence gates**

Run: `bun run typecheck && bun run lint && bun run check:personal-data && bun run check:secret-scan && bun run check:licensing`

Expected: exit 0 with zero warnings and no identity values detected.

- [ ] **Step 7: Commit the policy core**

```bash
git add tools/clever/context.ts tools/clever/context.test.ts tsconfig.json REUSE.toml
git commit -m "feat: validate personal Clever context"
```

---

### Task 2: Isolated filesystem and subprocess boundary

**Files:**
- Create: `tools/clever/runtime.ts`
- Create: `tools/clever/runtime.test.ts`

**Interfaces:**
- Consumes: `Result`, `ContextError`, `parseProfile`, `parsePolicy`, `parseBinding`
- Produces: `resolvePersonalPaths(home: string): PersonalPaths`
- Produces: `buildIsolatedEnvironment(input: RuntimeEnvironmentInput): Record<string, string>`
- Produces: `checkProtectedMode(path, kind): Promise<Result<void, ContextError>>`
- Produces: `readJsonFile(path): Promise<Result<unknown, ContextError>>`
- Produces: `writeJsonAtomically(path, value, mode): Promise<Result<void, ContextError>>`
- Produces: `runCaptured(command, args, options): Promise<CommandResult>`

- [ ] **Step 1: Write failing runtime tests**

Use temporary directories and a fake executable. Test exact paths beneath a supplied fake home, environment scrubbing, dedicated `GIT_SSH_COMMAND`, mode refusals, atomic replacement, bounded stdout/stderr, and preserved exit codes.

```ts
expect(result.environment.CLEVER_TOKEN).toBeUndefined();
expect(result.environment.CONFIGURATION_FILE).toBe(paths.credentials);
expect(result.environment.APP_CONFIGURATION_FILE).toBe(paths.binding);
expect(result.environment.GIT_SSH_COMMAND).toContain("IdentitiesOnly=yes");
expect(result.environment.GIT_SSH_COMMAND).toContain(paths.sshPrivateKey);
```

- [ ] **Step 2: Run the focused test and prove RED**

Run: `bun test tools/clever/runtime.test.ts`

Expected: FAIL because `tools/clever/runtime.ts` does not exist.

- [ ] **Step 3: Implement fixed path derivation and environment scrubbing**

Derive paths from the injected home for tests and `homedir()` in production. Delete at least:

```ts
const blockedEnvironmentNames = [
  "CLEVER_TOKEN",
  "CLEVER_SECRET",
  "CONFIGURATION_FILE",
  "APP_CONFIGURATION_FILE",
  "API_HOST",
  "AUTH_BRIDGE_HOST",
  "CONSOLE_URL",
  "OAUTH_CONSUMER_KEY",
  "OAUTH_CONSUMER_SECRET",
  "SSH_GATEWAY",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
] as const;
```

Set only the fixed isolated paths and a quoted dedicated SSH command. Preserve unrelated environment required to locate Bun, Git, Clever, and SSH.

- [ ] **Step 4: Implement protected I/O and command capture**

Require directory mode `0700`, secret file modes `0600`, private key mode `0600`, and public key mode `0644` or stricter. Atomic writes create a sibling temporary file with exclusive creation, sync, chmod, rename, and cleanup on failure. Cap each captured stream at 64 KiB and return truncation flags.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run: `bun test tools/clever/runtime.test.ts`

Expected: all runtime cases PASS.

- [ ] **Step 6: Run all unit gates**

Run: `bun run typecheck && bun run lint && bun test`

Expected: exit 0 and global line/function coverage remains at least 90%.

- [ ] **Step 7: Commit the process boundary**

```bash
git add tools/clever/runtime.ts tools/clever/runtime.test.ts
git commit -m "feat: isolate Clever process state"
```

---

### Task 3: Fail-closed repository CLI

**Files:**
- Create: `tools/clever/personal.ts`
- Create: `tools/clever/personal.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: policy parsers/validators and isolated runtime primitives
- Produces: `runPersonalClever(args: readonly string[], dependencies): Promise<number>`
- Produces package scripts: `clever:personal`, `clever:doctor`, `clever:login`

- [ ] **Step 1: Write failing CLI tests**

Inject fake Git, Clever, SSH, and quality-gate runners. Cover the exact allowlist:

```ts
const operations = [
  "doctor",
  "login",
  "create-staging",
  "status",
  "activity",
  "logs",
  "deploy-staging",
  "stop-staging",
  "rollback-staging",
] as const;
```

Assert refusal for unknown operations, extra owner/app/alias/credential/endpoint/force flags, wrong origin, non-`main`, dirty state, `HEAD !== origin/main`, red checks, missing key, wrong profile, wrong owner, disabled 2FA, and missing binding. Assert no mutating fake call occurs after any refusal.

- [ ] **Step 2: Run the focused test and prove RED**

Run: `bun test tools/clever/personal.test.ts`

Expected: FAIL because `tools/clever/personal.ts` does not exist.

- [ ] **Step 3: Implement doctor and login**

`login` may only run when the isolated credential file is absent. It invokes:

```text
clever --no-update-notifier login --alias libre-ai-personal
```

against the isolated config, then validates the exact locally stored expected email without printing it. `doctor` returns named PASS/FAIL checks and redacts all identity fields.

- [ ] **Step 4: Implement staging command construction**

Use fixed command arguments. `create-staging` points `APP_CONFIGURATION_FILE` at a protected temporary candidate and forces:

```text
clever --no-update-notifier create --type static libre-ai-website-staging --region par --org <validated-personal-user-id> --alias website-staging --format json
```

After Clever returns, parse and validate the candidate binding before atomically replacing the final binding with mode `0600`. Never accept user-supplied Clever arguments. Read-only and recovery operations always use the validated binding alias. `rollback-staging` requires one explicit commit ID matching `/^[0-9a-f]{40}$/`.

- [ ] **Step 5: Implement deployment gates**

Before deployment, run exact Git checks and then:

```text
bun run check
bun run test:e2e
```

Only after both succeed may the CLI invoke the isolated Clever deployment. On failed smoke, stop the staging app; report prior activity without automatically restarting an earlier commit.

- [ ] **Step 6: Run focused tests and prove GREEN**

Run: `bun test tools/clever/personal.test.ts`

Expected: all allowlist, refusal, redaction, and no-mutation assertions PASS.

- [ ] **Step 7: Add package entry points**

Add scripts that expose no raw arguments except the high-level operation:

```json
"clever:personal": "bun run check:bun:runtime && bun tools/clever/personal.ts",
"clever:doctor": "bun run clever:personal -- doctor",
"clever:login": "bun run clever:personal -- login"
```

- [ ] **Step 8: Run all unit gates**

Run: `bun run check`

Expected: exit 0, zero warnings, at least 90% line/function coverage.

- [ ] **Step 9: Commit the guarded CLI**

```bash
git add tools/clever/personal.ts tools/clever/personal.test.ts package.json
git commit -m "feat: guard personal Clever operations"
```

---

### Task 4: Public operational contract

**Files:**
- Modify: `README.md`
- Modify: `README.fr.md`
- Modify: `docs/apps/website.md`
- Modify: `project.v1.yaml`

**Interfaces:**
- Consumes: package scripts from Task 3
- Produces: public deployment/refusal documentation with no real identity values

- [ ] **Step 1: Write the documentation assertions first**

Extend an existing focused test or add `tools/clever/documentation.test.ts` to assert that contributor documentation:

- uses `bun run clever:doctor` and `bun run clever:personal -- <operation>`;
- states that raw global `clever` commands are unsupported in this repository;
- contains neither a real email domain nor any Clever resource identifier;
- describes Personal Space, 2FA, dedicated SSH identity, Paris staging, and rollback refusal.

- [ ] **Step 2: Run the documentation test and prove RED**

Run: `bun test tools/clever/documentation.test.ts`

Expected: FAIL because the deployment contract is absent.

- [ ] **Step 3: Document the guarded flow in English and French**

Add concise setup, doctor, staging, smoke, stop, and rollback commands. Use `<personal-email>` and `<previous-commit-sha>` placeholders only in user-facing command examples; never include the enrolled value. State that direct `clever` invocation bypasses repository protection and is refused by policy.

- [ ] **Step 4: Update the project truth**

Keep public deployment pending until the real staging smoke passes. Add the personal-context boundary and its tests as release evidence without claiming a deployed URL.

- [ ] **Step 5: Run documentation and aggregate gates**

Run: `bun test tools/clever/documentation.test.ts && bun run check && bun run test:e2e`

Expected: documentation test and 25 Playwright assertions PASS; existing redundant capture skips remain expected.

- [ ] **Step 6: Commit the operational contract**

```bash
git add README.md README.fr.md docs/apps/website.md project.v1.yaml tools/clever/documentation.test.ts
git commit -m "docs: require the personal Clever boundary"
```

---

### Task 5: Review, merge, and fleet-green proof

**Files:**
- Review all changes since `ddfc9fb`

**Interfaces:**
- Consumes: Tasks 1-4
- Produces: reviewed and merged personal-context guard before any real account enrollment

- [ ] **Step 1: Run final local verification**

Run:

```bash
bun run check
bun run test:e2e
git diff --check main...HEAD
git status --short
```

Expected: all gates green and only intended committed changes.

- [ ] **Step 2: Perform the four-axis and sovereignty review**

Security: prove fail-closed identity, owner, 2FA, environment, SSH, redaction, and no secret persistence. Quality: prove strict types, explicit errors, TDD, coverage, docs, and licences. Performance: prove no network call is duplicated on a single operation and output is bounded. Completeness: map every design invariant to a test or guarded runtime check.

- [ ] **Step 3: Push and open a pull request**

Use the branch `security/clever-personal-context`. The PR body must include test evidence, sanitized incident scope, no real identity, and DCO-compliant commits.

- [ ] **Step 4: Require green remote checks before merge**

Verify all PR checks and merge with an owner `Signed-off-by` trailer in the integration commit body. Verify post-merge main checks before proceeding.

- [ ] **Step 5: Synchronize and clean the worktree**

Fast-forward the main Website checkout, verify exact tree equality with `origin/main`, then remove the isolated worktree and local/remote feature branch.

---

### Task 6: Enroll the real personal account

**Files:**
- Create outside Git: protected personal Clever configuration, policy, binding, and SSH key files
- Modify remotely: add the dedicated public SSH key to the personal Clever account

**Interfaces:**
- Consumes: merged guarded CLI
- Produces: a real `doctor` PASS bound to the expected personal identity without printing it

- [ ] **Step 1: Verify the global non-personal config remains untouched**

Record only its pre-enrollment modification timestamp and content digest locally; do not print or copy its contents. Recheck both after enrollment.

- [ ] **Step 2: Create protected personal local state**

Create `~/.config/libre-ai/clever/` as `0700`. Prompt interactively for the expected email and write `context.json` as `0600` without echoing the value.

- [ ] **Step 3: Authenticate interactively**

Run `bun run clever:login`, complete Clever OAuth in the browser, and refuse immediately if the returned identity differs or lacks 2FA.

- [ ] **Step 4: Create and register the dedicated SSH key**

Generate Ed25519 key `~/.ssh/libre_ai_clever_personal_ed25519` only if absent. Register its public half through the isolated personal profile with `clever --no-update-notifier ssh-keys add libre-ai-website ~/.ssh/libre_ai_clever_personal_ed25519.pub`. Never offer or modify the default key.

- [ ] **Step 5: Run the real personal doctor**

Run: `bun run clever:doctor`

Expected: redacted PASS for isolated credentials, exact identity, valid token, 2FA, Personal Space owner, dedicated SSH key, personal Git origin, and no binding yet.

- [ ] **Step 6: Prove no cross-context mutation**

Verify the global config digest/mtime is unchanged, no `.clever.json` exists in Libre AI repositories, and no Clever remote was added to Git.

---

### Task 7: Create and deploy staging

**Files:**
- Create outside Git: `~/.config/libre-ai/clever/website-staging.json`
- Create remotely: one static staging application in the authenticated Personal Space, region `par`

**Interfaces:**
- Consumes: real `doctor` PASS and merged `origin/main`
- Produces: technical staging URL with green smoke evidence

- [ ] **Step 1: Create the staging application**

Run: `bun run clever:personal -- create-staging`

Expected: one static Paris application owned by the authenticated personal user; validated binding written mode `0600`.

- [ ] **Step 2: Re-run doctor with the binding**

Run: `bun run clever:doctor`

Expected: all identity and binding checks PASS without printing resource IDs.

- [ ] **Step 3: Deploy the exact green main commit**

Run: `bun run clever:personal -- deploy-staging`

Expected: local aggregate and browser gates pass first, then Clever reaches `UP` using the dedicated SSH key.

- [ ] **Step 4: Run post-deploy smoke tests**

Check the technical HTTPS URL for status 200, expected wordmark, primary CTA, adjacent demonstration boundary, comparisons route, brand route, no remote assets, no client script, and security headers.

- [ ] **Step 5: Handle failure without concealment**

If smoke fails, run the guarded stop operation, preserve logs and activity evidence, identify the previous successful commit if one exists, and require an explicit rollback action. Do not attach a canonical domain.

- [ ] **Step 6: Record sanitized deployment evidence**

Create `docs/evidence/clever-staging-deployment.md` and update `README.md`, `README.fr.md`, and `project.v1.yaml` only after a green technical-URL smoke. Record date, commit, gate results, and URL without account email, owner ID, application ID, or SSH fingerprint. Commit as `docs: record the staging deployment`, open a review PR, require green checks and a signed integration commit, fast-forward local `main`, deploy that final `origin/main`, and repeat the technical-URL smoke so the live revision equals repository truth.
