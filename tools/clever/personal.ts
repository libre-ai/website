import { chmod, mkdir, readFile, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  type CleverBinding,
  type ContextError,
  parseBinding,
  parsePolicy,
  parseProfile,
  parseRemoteApplications,
  type RemoteApplication,
  redactContextError,
  type ValidatedBinding,
  type ValidatedIdentity,
  validateIdentity,
  validateOptionalBinding,
  validateRemoteApplication,
} from "./context";
import {
  buildIsolatedEnvironment,
  type CommandOptions,
  type CommandResult,
  checkProtectedMode,
  type PersonalPaths,
  readJsonFile,
  resolvePersonalPaths,
  runCaptured,
  runInteractive,
  writeJsonAtomically,
} from "./runtime";

export interface PersonalCleverDependencies {
  home: string;
  cwd: string;
  environment: Readonly<Record<string, string | undefined>>;
  runCaptured: (
    command: string,
    arguments_: readonly string[],
    options?: CommandOptions,
  ) => Promise<CommandResult>;
  runInteractive: (
    command: string,
    arguments_: readonly string[],
    options?: Omit<CommandOptions, "maxOutputBytes">,
  ) => Promise<number>;
  writeOutput: (message: string) => void;
  writeError: (message: string) => void;
}

interface ValidatedContext {
  paths: PersonalPaths;
  environment: Record<string, string>;
  identity: ValidatedIdentity;
  binding: ValidatedBinding | null;
  applications: readonly RemoteApplication[];
}

const cleverCommand = "clever";
const expectedOrigin = "https://github.com/libre-ai/website.git";
const stagingAlias = "website-staging";
const stagingName = "libre-ai-website-staging";
const sshKeyName = "libre-ai-website";
const expectedEmailEnvironmentName = "LIBRE_AI_CLEVER_EXPECTED_EMAIL";
const forbiddenEnvironmentNames = [
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

function defaultDependencies(): PersonalCleverDependencies {
  return {
    home: homedir(),
    cwd: process.cwd(),
    environment: process.env,
    runCaptured,
    runInteractive,
    writeOutput: (message) => console.log(message),
    writeError: (message) => console.error(message),
  };
}

function contextFailure(code: ContextError["code"], safeMessage: string): ContextError {
  return { code, safeMessage };
}

function reportFailure(dependencies: PersonalCleverDependencies, error: ContextError): number {
  dependencies.writeError(redactContextError(error));
  return 1;
}

function hasForbiddenEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return forbiddenEnvironmentNames.some((name) => environment[name] !== undefined);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function parseCapturedJson(
  result: CommandResult,
): { ok: true; value: unknown } | { ok: false; error: ContextError } {
  if (result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated) {
    return {
      ok: false,
      error: contextFailure("COMMAND_ERROR", "An isolated Clever command failed."),
    };
  }
  try {
    return { ok: true, value: JSON.parse(result.stdout) as unknown };
  } catch {
    return {
      ok: false,
      error: contextFailure("COMMAND_ERROR", "An isolated Clever response is malformed."),
    };
  }
}

async function loadProfile(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
) {
  const result = await dependencies.runCaptured(
    cleverCommand,
    ["--no-update-notifier", "profile", "--format", "json"],
    { cwd: dependencies.cwd, environment },
  );
  const json = parseCapturedJson(result);
  if (!json.ok) return json;
  return parseProfile(json.value);
}

async function loadApplications(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
  ownerId: string,
) {
  const result = await dependencies.runCaptured(
    cleverCommand,
    ["--no-update-notifier", "applications", "list", "--org", ownerId, "--format", "json"],
    { cwd: dependencies.cwd, environment },
  );
  const json = parseCapturedJson(result);
  if (!json.ok) return json;
  return parseRemoteApplications(json.value);
}

function parseSshKeys(
  value: unknown,
):
  | { ok: true; value: readonly { name: string; key: string }[] }
  | { ok: false; error: ContextError } {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: contextFailure("SSH_KEY_MISMATCH", "The personal SSH key inventory is malformed."),
    };
  }
  const keys: { name: string; key: string }[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof Reflect.get(item, "name") !== "string" ||
      typeof Reflect.get(item, "key") !== "string"
    ) {
      return {
        ok: false,
        error: contextFailure("SSH_KEY_MISMATCH", "The personal SSH key inventory is malformed."),
      };
    }
    keys.push({ name: Reflect.get(item, "name"), key: Reflect.get(item, "key") });
  }
  return { ok: true, value: keys };
}

async function validateRemoteSshKey(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
  paths: PersonalPaths,
): Promise<ContextError | null> {
  const result = await dependencies.runCaptured(
    cleverCommand,
    ["--no-update-notifier", "ssh-keys", "--format", "json"],
    { cwd: dependencies.cwd, environment },
  );
  const json = parseCapturedJson(result);
  if (!json.ok) return json.error;
  const keys = parseSshKeys(json.value);
  if (!keys.ok) return keys.error;

  let localPublicKey: string;
  try {
    localPublicKey = (await readFile(paths.sshPublicKey, "utf8")).trim();
  } catch {
    return contextFailure("SSH_KEY_MISMATCH", "The dedicated personal SSH key is unavailable.");
  }
  const matching = keys.value.filter((key) => key.name === sshKeyName);
  if (matching.length !== 1 || matching[0]?.key.trim() !== localPublicKey) {
    return contextFailure("SSH_KEY_MISMATCH", "The dedicated personal SSH key is not registered.");
  }
  return null;
}

async function loadValidatedContext(
  dependencies: PersonalCleverDependencies,
): Promise<{ ok: true; value: ValidatedContext } | { ok: false; error: ContextError }> {
  if (hasForbiddenEnvironment(dependencies.environment)) {
    return {
      ok: false,
      error: contextFailure("UNSAFE_ENVIRONMENT", "A forbidden context override is present."),
    };
  }

  const paths = resolvePersonalPaths(dependencies.home);
  for (const [path, kind] of [
    [paths.configDirectory, "directory"],
    [paths.policy, "secret"],
    [paths.credentials, "secret"],
    [paths.sshPrivateKey, "private-key"],
    [paths.sshPublicKey, "public-key"],
  ] as const) {
    const mode = await checkProtectedMode(path, kind);
    if (!mode.ok) return mode;
  }

  const policyJson = await readJsonFile(paths.policy);
  if (!policyJson.ok) return policyJson;
  const policy = parsePolicy(policyJson.value);
  if (!policy.ok) return policy;

  const environment = buildIsolatedEnvironment({ source: dependencies.environment, paths });
  const repositoryError = await verifyRepositoryIdentity(dependencies, environment);
  if (repositoryError !== null) return { ok: false, error: repositoryError };
  const profile = await loadProfile(dependencies, environment);
  if (!profile.ok) return profile;
  const identity = validateIdentity(profile.value, policy.value);
  if (!identity.ok) return identity;

  const sshError = await validateRemoteSshKey(dependencies, environment, paths);
  if (sshError !== null) return { ok: false, error: sshError };

  let rawBinding: CleverBinding | null = null;
  if (await pathExists(paths.binding)) {
    const bindingMode = await checkProtectedMode(paths.binding, "secret");
    if (!bindingMode.ok) return bindingMode;
    const bindingJson = await readJsonFile(paths.binding);
    if (!bindingJson.ok) return bindingJson;
    const binding = parseBinding(bindingJson.value);
    if (!binding.ok) return binding;
    rawBinding = binding.value;
  }
  const binding = validateOptionalBinding(rawBinding, identity.value);
  if (!binding.ok) return binding;

  const applications = await loadApplications(dependencies, environment, identity.value.ownerId);
  if (!applications.ok) return applications;
  if (binding.value !== null) {
    const remote = validateRemoteApplication(applications.value, identity.value);
    if (!remote.ok || remote.value.app_id !== binding.value.app_id) {
      return remote.ok
        ? {
            ok: false,
            error: contextFailure("UNSAFE_BINDING", "The local and remote staging apps differ."),
          }
        : remote;
    }
  } else if (applications.value.some((application) => application.name === stagingName)) {
    return {
      ok: false,
      error: contextFailure(
        "REMOTE_APP_CONFLICT",
        "An unbound staging application already exists.",
      ),
    };
  }

  return {
    ok: true,
    value: {
      paths,
      environment,
      identity: identity.value,
      binding: binding.value,
      applications: applications.value,
    },
  };
}

async function runDoctor(dependencies: PersonalCleverDependencies): Promise<number> {
  const context = await loadValidatedContext(dependencies);
  if (!context.ok) return reportFailure(dependencies, context.error);
  dependencies.writeOutput(
    context.value.binding === null
      ? "PASS: personal Clever context verified; staging is not bound."
      : "PASS: personal Clever context and staging binding verified.",
  );
  return 0;
}

async function runLogin(dependencies: PersonalCleverDependencies): Promise<number> {
  if (hasForbiddenEnvironment(dependencies.environment)) {
    return reportFailure(
      dependencies,
      contextFailure("UNSAFE_ENVIRONMENT", "A forbidden context override is present."),
    );
  }
  const paths = resolvePersonalPaths(dependencies.home);
  const environment = buildIsolatedEnvironment({ source: dependencies.environment, paths });
  const repositoryError = await verifyRepositoryIdentity(dependencies, environment);
  if (repositoryError !== null) return reportFailure(dependencies, repositoryError);

  await mkdir(paths.configDirectory, { recursive: true, mode: 0o700 });
  await chmod(paths.configDirectory, 0o700);
  await mkdir(dirname(paths.sshPrivateKey), { recursive: true, mode: 0o700 });

  let policyValue: unknown;
  if (await pathExists(paths.policy)) {
    const policyMode = await checkProtectedMode(paths.policy, "secret");
    if (!policyMode.ok) return reportFailure(dependencies, policyMode.error);
    const existing = await readJsonFile(paths.policy);
    if (!existing.ok) return reportFailure(dependencies, existing.error);
    policyValue = existing.value;
  } else {
    const expectedEmail = dependencies.environment[expectedEmailEnvironmentName];
    const initialPolicy = parsePolicy({
      version: 1,
      expectedEmail,
      expectedUserId: null,
      expectedOwnerId: null,
    });
    if (!initialPolicy.ok) return reportFailure(dependencies, initialPolicy.error);
    const written = await writeJsonAtomically(paths.policy, initialPolicy.value, 0o600);
    if (!written.ok) return reportFailure(dependencies, written.error);
    policyValue = initialPolicy.value;
  }
  const policy = parsePolicy(policyValue);
  if (!policy.ok) return reportFailure(dependencies, policy.error);

  if (!(await pathExists(paths.credentials))) {
    const loginExit = await dependencies.runInteractive(
      cleverCommand,
      ["--no-update-notifier", "login", "--alias", "libre-ai-personal"],
      { cwd: dependencies.cwd, environment },
    );
    if (loginExit !== 0) {
      return reportFailure(
        dependencies,
        contextFailure("COMMAND_ERROR", "The isolated Clever login failed."),
      );
    }
  }
  if (!(await pathExists(paths.credentials))) {
    return reportFailure(
      dependencies,
      contextFailure("COMMAND_ERROR", "The isolated Clever login did not create credentials."),
    );
  }
  await chmod(paths.credentials, 0o600);

  const profile = await loadProfile(dependencies, environment);
  if (!profile.ok) return reportFailure(dependencies, profile.error);
  const identity = validateIdentity(profile.value, policy.value);
  if (!identity.ok) return reportFailure(dependencies, identity.error);
  const enrolled = await writeJsonAtomically(
    paths.policy,
    {
      ...policy.value,
      expectedUserId: identity.value.userId,
      expectedOwnerId: identity.value.ownerId,
    },
    0o600,
  );
  if (!enrolled.ok) return reportFailure(dependencies, enrolled.error);

  const privateExists = await pathExists(paths.sshPrivateKey);
  const publicExists = await pathExists(paths.sshPublicKey);
  if (privateExists !== publicExists) {
    return reportFailure(
      dependencies,
      contextFailure("SSH_KEY_MISMATCH", "The dedicated personal SSH key pair is incomplete."),
    );
  }
  if (!privateExists) {
    const keyExit = await dependencies.runInteractive(
      "ssh-keygen",
      ["-t", "ed25519", "-f", paths.sshPrivateKey, "-N", "", "-C", "libre-ai-clever-personal"],
      { cwd: dependencies.cwd, environment },
    );
    if (keyExit !== 0) {
      return reportFailure(
        dependencies,
        contextFailure("COMMAND_ERROR", "The dedicated personal SSH key could not be created."),
      );
    }
  }
  if (!(await pathExists(paths.sshPrivateKey)) || !(await pathExists(paths.sshPublicKey))) {
    return reportFailure(
      dependencies,
      contextFailure("COMMAND_ERROR", "The dedicated personal SSH key was not created."),
    );
  }
  await chmod(paths.sshPrivateKey, 0o600);
  await chmod(paths.sshPublicKey, 0o644);

  const sshError = await validateRemoteSshKey(dependencies, environment, paths);
  if (sshError !== null) {
    const keysResult = await dependencies.runCaptured(
      cleverCommand,
      ["--no-update-notifier", "ssh-keys", "--format", "json"],
      { cwd: dependencies.cwd, environment },
    );
    const keysJson = parseCapturedJson(keysResult);
    const keys = keysJson.ok ? parseSshKeys(keysJson.value) : keysJson;
    if (!keys.ok) return reportFailure(dependencies, keys.error);
    if (keys.value.some((key) => key.name === sshKeyName)) {
      return reportFailure(dependencies, sshError);
    }
    const addExit = await dependencies.runInteractive(
      cleverCommand,
      ["--no-update-notifier", "ssh-keys", "add", sshKeyName, paths.sshPublicKey],
      { cwd: dependencies.cwd, environment },
    );
    if (addExit !== 0) return reportFailure(dependencies, sshError);
    const registrationError = await validateRemoteSshKey(dependencies, environment, paths);
    if (registrationError !== null) return reportFailure(dependencies, registrationError);
  }

  dependencies.writeOutput("PASS: personal Clever identity and dedicated SSH key enrolled.");
  return 0;
}

async function runCreateStaging(dependencies: PersonalCleverDependencies): Promise<number> {
  const context = await loadValidatedContext(dependencies);
  if (!context.ok) return reportFailure(dependencies, context.error);
  if (context.value.binding !== null) {
    return reportFailure(
      dependencies,
      contextFailure("REMOTE_APP_CONFLICT", "The staging target is already present or ambiguous."),
    );
  }
  if (await pathExists(context.value.paths.bindingCandidate)) {
    return reportFailure(
      dependencies,
      contextFailure("UNSAFE_BINDING", "A stale staging binding candidate exists."),
    );
  }

  const candidateEnvironment = buildIsolatedEnvironment({
    source: dependencies.environment,
    paths: context.value.paths,
    applicationConfigurationFile: context.value.paths.bindingCandidate,
  });
  const created = await dependencies.runCaptured(
    cleverCommand,
    [
      "--no-update-notifier",
      "create",
      "--type",
      "static",
      stagingName,
      "--region",
      "par",
      "--org",
      context.value.identity.ownerId,
      "--alias",
      stagingAlias,
      "--format",
      "json",
    ],
    { cwd: dependencies.cwd, environment: candidateEnvironment },
  );
  if (created.exitCode !== 0) {
    return reportFailure(
      dependencies,
      contextFailure("COMMAND_ERROR", "The personal staging application could not be created."),
    );
  }

  const candidateMode = await checkProtectedMode(context.value.paths.bindingCandidate, "secret");
  if (!candidateMode.ok) return reportFailure(dependencies, candidateMode.error);
  const candidateJson = await readJsonFile(context.value.paths.bindingCandidate);
  if (!candidateJson.ok) return reportFailure(dependencies, candidateJson.error);
  const candidate = parseBinding(candidateJson.value);
  if (!candidate.ok) return reportFailure(dependencies, candidate.error);
  const binding = validateOptionalBinding(candidate.value, context.value.identity);
  if (!binding.ok || binding.value === null) {
    return reportFailure(
      dependencies,
      binding.ok
        ? contextFailure("UNSAFE_BINDING", "The staging binding candidate is empty.")
        : binding.error,
    );
  }

  const applications = await loadApplications(
    dependencies,
    context.value.environment,
    context.value.identity.ownerId,
  );
  if (!applications.ok) return reportFailure(dependencies, applications.error);
  const remote = validateRemoteApplication(applications.value, context.value.identity);
  if (!remote.ok || remote.value.app_id !== binding.value.app_id) {
    return reportFailure(
      dependencies,
      remote.ok
        ? contextFailure("UNSAFE_BINDING", "The created staging application does not match.")
        : remote.error,
    );
  }

  const finalWrite = await writeJsonAtomically(
    context.value.paths.binding,
    candidateJson.value,
    0o600,
  );
  if (!finalWrite.ok) return reportFailure(dependencies, finalWrite.error);
  await unlink(context.value.paths.bindingCandidate);
  dependencies.writeOutput("PASS: personal Paris staging application created and bound.");
  return 0;
}

async function verifyGitState(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
): Promise<ContextError | null> {
  async function git(...arguments_: string[]): Promise<CommandResult> {
    return await dependencies.runCaptured("git", arguments_, {
      cwd: dependencies.cwd,
      environment,
    });
  }

  const branch = await git("branch", "--show-current");
  if (branch.exitCode !== 0 || branch.stdout.trim() !== "main") {
    return contextFailure("WRONG_BRANCH", "Staging deploys require the main branch.");
  }
  const status = await git("status", "--porcelain");
  if (status.exitCode !== 0 || status.stdout.trim() !== "") {
    return contextFailure("DIRTY_REPOSITORY", "Staging deploys require a clean repository.");
  }
  const head = await git("rev-parse", "HEAD");
  const remoteHead = await git("rev-parse", "origin/main");
  if (
    head.exitCode !== 0 ||
    remoteHead.exitCode !== 0 ||
    head.stdout.trim() !== remoteHead.stdout.trim()
  ) {
    return contextFailure("OUTDATED_MAIN", "Local main must equal origin/main before deployment.");
  }
  return null;
}

async function verifyRepositoryIdentity(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
): Promise<ContextError | null> {
  const root = await dependencies.runCaptured("git", ["rev-parse", "--show-toplevel"], {
    cwd: dependencies.cwd,
    environment,
  });
  if (root.exitCode !== 0 || resolve(root.stdout.trim()) !== resolve(dependencies.cwd)) {
    return contextFailure("WRONG_REPOSITORY", "The command is not running at the repository root.");
  }

  const origin = await dependencies.runCaptured("git", ["remote", "get-url", "origin"], {
    cwd: dependencies.cwd,
    environment,
  });
  if (origin.exitCode !== 0 || origin.stdout.trim() !== expectedOrigin) {
    return contextFailure(
      "WRONG_REPOSITORY",
      "The Git origin is not the personal Website repository.",
    );
  }
  return null;
}

async function runBoundOperation(
  operation: string,
  arguments_: readonly string[],
  dependencies: PersonalCleverDependencies,
): Promise<number> {
  const context = await loadValidatedContext(dependencies);
  if (!context.ok) return reportFailure(dependencies, context.error);
  if (context.value.binding === null) {
    return reportFailure(
      dependencies,
      contextFailure("MISSING_CONTEXT", "The personal staging application is not bound."),
    );
  }

  if (operation === "deploy-staging") {
    const gitError = await verifyGitState(dependencies, context.value.environment);
    if (gitError !== null) return reportFailure(dependencies, gitError);
    for (const gate of [
      ["run", "check"],
      ["run", "test:e2e"],
    ] as const) {
      const exitCode = await dependencies.runInteractive("bun", gate, {
        cwd: dependencies.cwd,
        environment: context.value.environment,
      });
      if (exitCode !== 0) {
        return reportFailure(
          dependencies,
          contextFailure("QUALITY_GATE_FAILED", "A required deployment gate failed."),
        );
      }
    }
    const exitCode = await dependencies.runInteractive(
      cleverCommand,
      [
        "--no-update-notifier",
        "deploy",
        "--alias",
        stagingAlias,
        "--branch",
        "main",
        "--follow",
        "--exit-on",
        "deploy-end",
      ],
      { cwd: dependencies.cwd, environment: context.value.environment },
    );
    return exitCode === 0
      ? 0
      : reportFailure(
          dependencies,
          contextFailure("COMMAND_ERROR", "The personal staging deployment failed."),
        );
  }

  const fixedArguments: Record<string, readonly string[]> = {
    status: ["--no-update-notifier", "status", "--alias", stagingAlias],
    activity: ["--no-update-notifier", "activity", "--alias", stagingAlias],
    logs: ["--no-update-notifier", "logs", "--alias", stagingAlias, "--since", "10m"],
    "stop-staging": ["--no-update-notifier", "stop", "--alias", stagingAlias],
  };
  const commandArguments = fixedArguments[operation];
  if (commandArguments !== undefined) {
    const exitCode = await dependencies.runInteractive(cleverCommand, commandArguments, {
      cwd: dependencies.cwd,
      environment: context.value.environment,
    });
    return exitCode;
  }

  const commit = arguments_[0];
  if (
    operation !== "rollback-staging" ||
    arguments_.length !== 1 ||
    !/^[0-9a-f]{40}$/.test(commit ?? "")
  ) {
    return 2;
  }
  return await dependencies.runInteractive(
    cleverCommand,
    [
      "--no-update-notifier",
      "restart",
      "--alias",
      stagingAlias,
      "--commit",
      commit ?? "",
      "--follow",
      "--exit-on",
      "deploy-end",
    ],
    { cwd: dependencies.cwd, environment: context.value.environment },
  );
}

export async function runPersonalClever(
  arguments_: readonly string[],
  dependencies = defaultDependencies(),
): Promise<number> {
  const [operation, ...operationArguments] = arguments_;
  const operationsWithoutArguments = new Set([
    "doctor",
    "login",
    "create-staging",
    "status",
    "activity",
    "logs",
    "deploy-staging",
    "stop-staging",
  ]);
  if (
    operation === undefined ||
    (!operationsWithoutArguments.has(operation) && operation !== "rollback-staging") ||
    (operationsWithoutArguments.has(operation) && operationArguments.length !== 0)
  ) {
    dependencies.writeError(
      "UNSUPPORTED_OPERATION: The requested Clever operation is not allowed.",
    );
    return 2;
  }

  if (operation === "doctor") return await runDoctor(dependencies);
  if (operation === "login") return await runLogin(dependencies);
  if (operation === "create-staging") return await runCreateStaging(dependencies);
  return await runBoundOperation(operation, operationArguments, dependencies);
}

if (import.meta.main) {
  process.exitCode = await runPersonalClever(process.argv.slice(2));
}
