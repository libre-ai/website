import { lstat, mkdir, mkdtemp, rm, unlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { addOauthHeader } from "@clevercloud/client/esm/oauth.js";

import { findExecutableMarkup, findRemoteAssetReferences } from "../../src/security";

import {
  type CleverBinding,
  type ContextError,
  parseBinding,
  parseCredentialsBoundary,
  parsePersonalApplications,
  parsePolicy,
  parseProfile,
  type RemoteApplication,
  type Result,
  redactContextError,
  type ValidatedBinding,
  type ValidatedCleverCredentials,
  type ValidatedIdentity,
  validateIdentity,
  validateOptionalBinding,
  validateRemoteApplication,
} from "./context";
import {
  buildIsolatedEnvironment,
  buildSanitizedEnvironment,
  type CommandOptions,
  type CommandResult,
  checkCanonicalPathWithinHome,
  checkProtectedMode,
  hasUnsafeContextOverride,
  type PersonalPaths,
  readJsonFile,
  resolvePersonalPaths,
  runCaptured,
  runInteractive,
  writeJsonAtomically,
} from "./runtime";

export interface PersonalCleverDependencies {
  bunCommand: string;
  cleverCommand: string;
  cleverArgumentsPrefix: readonly string[];
  gitCommand: string;
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
  fetchUrl: (url: string, init: RequestInit) => Promise<Response>;
  writeOutput: (message: string) => void;
  writeError: (message: string) => void;
}

interface ValidatedContext {
  paths: PersonalPaths;
  environment: Record<string, string>;
  identity: ValidatedIdentity;
  binding: ValidatedBinding | null;
  applications: readonly RemoteApplication[];
  credentials: ValidatedCleverCredentials;
}

const localCleverProgram = resolve(
  import.meta.dir,
  "../../node_modules/clever-tools/bin/clever.js",
);
const expectedOrigin = "https://github.com/libre-ai/website.git";
const expectedCleverVersion = "4.11.0";
const cleverApiUrl = "https://api.clever-cloud.com/v2/self/applications";
const cleverOauthConsumerKey = "T5nFjKeHH4AIlEveuGhB5S3xg8T19e";
const cleverOauthConsumerSecret = "MgVMqTr6fWlf2M0tkC2MXOnhfqBWDT";
const maximumApiBodyBytes = 1024 * 1024;
const stagingAlias = "website-staging";
const stagingName = "libre-ai-website-staging";
const expectedEmailEnvironmentName = "LIBRE_AI_CLEVER_EXPECTED_EMAIL";
const enrollmentEnvironmentExceptions = new Set([expectedEmailEnvironmentName]);
const maximumSmokeBodyBytes = 1024 * 1024;
const smokePaths = ["/", "/comparaisons.html", "/marque.html"] as const;
const staticApplicationEnvironment = [
  ["CC_BUILD_COMMAND", "true"],
  ["CC_STATIC_SERVER", "caddy"],
  ["CC_WEBROOT", "/site"],
  ["CC_HEALTH_CHECK_PATH_0", "/"],
  ["CC_HEALTH_CHECK_PATH_1", "/comparaisons.html"],
  ["CC_HEALTH_CHECK_PATH_2", "/marque.html"],
] as const;

function defaultDependencies(): PersonalCleverDependencies {
  return {
    bunCommand: process.execPath,
    cleverCommand: process.execPath,
    cleverArgumentsPrefix: [localCleverProgram],
    gitCommand: "/usr/bin/git",
    home: homedir(),
    cwd: process.cwd(),
    environment: process.env,
    runCaptured,
    runInteractive,
    fetchUrl: async (url, init) => await fetch(url, init),
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
  enrollment = false,
): boolean {
  return hasUnsafeContextOverride(
    environment,
    enrollment ? enrollmentEnvironmentExceptions : undefined,
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function validateProtectedPath(
  dependencies: PersonalCleverDependencies,
  path: string,
  kind: Parameters<typeof checkProtectedMode>[1],
): Promise<Result<void, ContextError>> {
  const mode = await checkProtectedMode(path, kind);
  if (!mode.ok) return mode;
  return await checkCanonicalPathWithinHome(path, dependencies.home);
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

async function validateCleverVersion(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
): Promise<ContextError | null> {
  const result = await runCleverCaptured(dependencies, ["--no-update-notifier", "--version"], {
    cwd: dependencies.cwd,
    environment,
    maxOutputBytes: 1024,
  });
  if (capturedCommandFailed(result) || result.stdout.trim() !== expectedCleverVersion) {
    return contextFailure("COMMAND_ERROR", "The pinned Clever Tools version is unavailable.");
  }
  return null;
}

function capturedCommandFailed(result: CommandResult): boolean {
  return result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated;
}

async function runCleverCaptured(
  dependencies: PersonalCleverDependencies,
  arguments_: readonly string[],
  options: CommandOptions,
): Promise<CommandResult> {
  return await dependencies.runCaptured(
    dependencies.cleverCommand,
    [...dependencies.cleverArgumentsPrefix, ...arguments_],
    options,
  );
}

async function loadProfile(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
) {
  const result = await runCleverCaptured(
    dependencies,
    ["--no-update-notifier", "profile", "--format", "json"],
    { cwd: dependencies.cwd, environment },
  );
  const json = parseCapturedJson(result);
  if (!json.ok) return json;
  return parseProfile(json.value);
}

async function loadApplications(
  dependencies: PersonalCleverDependencies,
  credentials: ValidatedCleverCredentials,
  ownerId: string,
) {
  try {
    const request = await addOauthHeader({
      OAUTH_CONSUMER_KEY: cleverOauthConsumerKey,
      OAUTH_CONSUMER_SECRET: cleverOauthConsumerSecret,
      API_OAUTH_TOKEN: credentials.token,
      API_OAUTH_TOKEN_SECRET: credentials.secret,
    })({
      url: cleverApiUrl,
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const authorization = request.headers?.authorization;
    if (authorization === undefined) {
      return {
        ok: false as const,
        error: contextFailure("COMMAND_ERROR", "The personal application request is unsigned."),
      };
    }
    const response = await dependencies.fetchUrl(cleverApiUrl, {
      method: "GET",
      headers: { Accept: "application/json", authorization },
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(10_000),
    });
    if (
      response.status !== 200 ||
      !response.headers.get("content-type")?.startsWith("application/json")
    ) {
      return {
        ok: false as const,
        error: contextFailure("COMMAND_ERROR", "The personal application request failed."),
      };
    }
    const body = await readBoundedResponseBody(response, maximumApiBodyBytes);
    if (body === null) {
      return {
        ok: false as const,
        error: contextFailure("COMMAND_ERROR", "The personal application response is malformed."),
      };
    }
    return parsePersonalApplications(JSON.parse(body) as unknown, ownerId);
  } catch {
    return {
      ok: false as const,
      error: contextFailure("COMMAND_ERROR", "The personal application request failed."),
    };
  }
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
  const environment = buildIsolatedEnvironment({ source: dependencies.environment, paths });
  for (const [path, kind] of [
    [paths.configDirectory, "directory"],
    [paths.runtimeHome, "directory"],
    [paths.xdgConfigHome, "directory"],
    [paths.xdgCacheHome, "directory"],
    [paths.xdgDataHome, "directory"],
    [paths.policy, "secret"],
    [paths.credentials, "secret"],
  ] as const) {
    const mode = await validateProtectedPath(dependencies, path, kind);
    if (!mode.ok) return mode;
  }

  const policyJson = await readJsonFile(paths.policy);
  if (!policyJson.ok) return policyJson;
  const policy = parsePolicy(policyJson.value);
  if (!policy.ok) return policy;

  const credentialsJson = await readJsonFile(paths.credentials);
  if (!credentialsJson.ok) return credentialsJson;
  const credentials = parseCredentialsBoundary(credentialsJson.value);
  if (!credentials.ok) return credentials;

  const repositoryError = await verifyRepositoryIdentity(dependencies, environment);
  if (repositoryError !== null) return { ok: false, error: repositoryError };
  const versionError = await validateCleverVersion(dependencies, environment);
  if (versionError !== null) return { ok: false, error: versionError };
  const profile = await loadProfile(dependencies, environment);
  if (!profile.ok) return profile;
  const identity = validateIdentity(profile.value, policy.value);
  if (!identity.ok) return identity;

  let rawBinding: CleverBinding | null = null;
  if (await pathExists(paths.binding)) {
    const bindingMode = await validateProtectedPath(dependencies, paths.binding, "secret");
    if (!bindingMode.ok) return bindingMode;
    const bindingJson = await readJsonFile(paths.binding);
    if (!bindingJson.ok) return bindingJson;
    const binding = parseBinding(bindingJson.value);
    if (!binding.ok) return binding;
    rawBinding = binding.value;
  }
  const binding = validateOptionalBinding(rawBinding, identity.value);
  if (!binding.ok) return binding;

  const applications = await loadApplications(
    dependencies,
    credentials.value,
    identity.value.ownerId,
  );
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
      credentials: credentials.value,
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
  if (hasForbiddenEnvironment(dependencies.environment, true)) {
    return reportFailure(
      dependencies,
      contextFailure("UNSAFE_ENVIRONMENT", "A forbidden context override is present."),
    );
  }
  const paths = resolvePersonalPaths(dependencies.home);
  const environment = buildIsolatedEnvironment({ source: dependencies.environment, paths });
  const repositoryError = await verifyRepositoryIdentity(dependencies, environment);
  if (repositoryError !== null) return reportFailure(dependencies, repositoryError);
  const versionError = await validateCleverVersion(dependencies, environment);
  if (versionError !== null) return reportFailure(dependencies, versionError);

  const configDirectoryExisted = await pathExists(paths.configDirectory);
  if (configDirectoryExisted) {
    const directoryMode = await validateProtectedPath(
      dependencies,
      paths.configDirectory,
      "directory",
    );
    if (!directoryMode.ok) return reportFailure(dependencies, directoryMode.error);
  } else {
    await mkdir(paths.configDirectory, { recursive: true, mode: 0o700 });
    const directoryMode = await validateProtectedPath(
      dependencies,
      paths.configDirectory,
      "directory",
    );
    if (!directoryMode.ok) return reportFailure(dependencies, directoryMode.error);
  }
  for (const directory of [
    paths.runtimeHome,
    paths.xdgConfigHome,
    paths.xdgCacheHome,
    paths.xdgDataHome,
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryMode = await validateProtectedPath(dependencies, directory, "directory");
    if (!directoryMode.ok) return reportFailure(dependencies, directoryMode.error);
  }
  let policyValue: unknown;
  if (await pathExists(paths.policy)) {
    const policyMode = await validateProtectedPath(dependencies, paths.policy, "secret");
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

  const credentialsExisted = await pathExists(paths.credentials);
  if (credentialsExisted) {
    const credentialsMode = await validateProtectedPath(dependencies, paths.credentials, "secret");
    if (!credentialsMode.ok) return reportFailure(dependencies, credentialsMode.error);
  } else {
    const protectedPlaceholder = await writeJsonAtomically(
      paths.credentials,
      { version: 1, profiles: [] },
      0o600,
    );
    if (!protectedPlaceholder.ok) {
      return reportFailure(dependencies, protectedPlaceholder.error);
    }
    const loginResult = await runCleverCaptured(
      dependencies,
      ["--no-update-notifier", "login", "--alias", "libre-ai-personal"],
      { cwd: dependencies.cwd, environment, maxOutputBytes: 64 * 1024 },
    );
    if (capturedCommandFailed(loginResult)) {
      try {
        await unlink(paths.credentials);
      } catch {
        return reportFailure(
          dependencies,
          contextFailure("FILE_IO_ERROR", "The failed Clever enrollment could not be cleaned."),
        );
      }
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
  const protectedCredentials = await validateProtectedPath(
    dependencies,
    paths.credentials,
    "secret",
  );
  if (!protectedCredentials.ok) return reportFailure(dependencies, protectedCredentials.error);
  const credentialsJson = await readJsonFile(paths.credentials);
  if (!credentialsJson.ok) return reportFailure(dependencies, credentialsJson.error);
  const credentials = parseCredentialsBoundary(credentialsJson.value);
  if (!credentials.ok) {
    if (!credentialsExisted) {
      try {
        await unlink(paths.credentials);
      } catch {
        return reportFailure(
          dependencies,
          contextFailure("FILE_IO_ERROR", "The failed Clever enrollment could not be cleaned."),
        );
      }
      return reportFailure(
        dependencies,
        contextFailure("COMMAND_ERROR", "The isolated Clever login did not create credentials."),
      );
    }
    return reportFailure(dependencies, credentials.error);
  }

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

  dependencies.writeOutput("PASS: personal Clever identity enrolled in isolated storage.");
  return 0;
}

function parseCreatedApplicationId(result: CommandResult): Result<string, ContextError> {
  const json = parseCapturedJson(result);
  if (!json.ok) return json;
  if (typeof json.value !== "object" || json.value === null || Array.isArray(json.value)) {
    return {
      ok: false,
      error: contextFailure("COMMAND_ERROR", "The staging creation receipt is malformed."),
    };
  }
  const id = Reflect.get(json.value, "id");
  const name = Reflect.get(json.value, "name");
  const deployUrl = Reflect.get(json.value, "deployUrl");
  let urlIsSafe = false;
  if (typeof deployUrl === "string") {
    try {
      const url = new URL(deployUrl);
      urlIsSafe =
        url.protocol === "https:" &&
        url.username === "" &&
        url.password === "" &&
        url.port === "" &&
        url.pathname === `/${id}.git` &&
        url.search === "" &&
        url.hash === "" &&
        url.hostname === "push.par.clever-cloud.com";
    } catch {
      urlIsSafe = false;
    }
  }
  if (typeof id !== "string" || !id.startsWith("app_") || name !== stagingName || !urlIsSafe) {
    return {
      ok: false,
      error: contextFailure("COMMAND_ERROR", "The staging creation receipt is malformed."),
    };
  }
  return { ok: true, value: id };
}

async function reportFailedCreation(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
  paths: PersonalPaths,
  identity: ValidatedIdentity,
  credentials: ValidatedCleverCredentials,
  applicationId: string,
  originalError: ContextError,
): Promise<number> {
  const applications = await loadApplications(dependencies, credentials, identity.ownerId);
  if (!applications.ok) {
    return reportFailure(
      dependencies,
      contextFailure(
        "REMOTE_APP_CONFLICT",
        "The failed staging creation could not be reconciled safely.",
      ),
    );
  }
  const remote = validateRemoteApplication(applications.value, identity);
  if (!remote.ok || remote.value.app_id !== applicationId) {
    return reportFailure(
      dependencies,
      contextFailure(
        "REMOTE_APP_CONFLICT",
        "The failed staging creation left an ambiguous remote state.",
      ),
    );
  }
  const rollbackBinding = {
    apps: [
      {
        app_id: remote.value.app_id,
        org_id: remote.value.org_id,
        deploy_url: remote.value.deploy_url,
        git_ssh_url: remote.value.git_ssh_url,
        name: remote.value.name,
        alias: stagingAlias,
      },
    ],
  };
  const bindingWrite = await writeJsonAtomically(paths.bindingCandidate, rollbackBinding, 0o600);
  if (!bindingWrite.ok) return reportFailure(dependencies, bindingWrite.error);
  const candidateEnvironment = buildIsolatedEnvironment({
    source: environment,
    paths,
    applicationConfigurationFile: paths.bindingCandidate,
  });
  const deletion = await runCleverCaptured(
    dependencies,
    ["--no-update-notifier", "delete", "--alias", stagingAlias, "--yes"],
    { cwd: dependencies.cwd, environment: candidateEnvironment, maxOutputBytes: 64 * 1024 },
  );
  if (capturedCommandFailed(deletion)) {
    return reportFailure(
      dependencies,
      contextFailure(
        "REMOTE_APP_CONFLICT",
        "The failed staging creation could not be rolled back safely.",
      ),
    );
  }
  const remainingApplications = await loadApplications(dependencies, credentials, identity.ownerId);
  if (
    !remainingApplications.ok ||
    remainingApplications.value.some((application) => application.app_id === applicationId)
  ) {
    return reportFailure(
      dependencies,
      contextFailure(
        "REMOTE_APP_CONFLICT",
        "The failed staging creation rollback could not be verified.",
      ),
    );
  }
  try {
    await unlink(paths.bindingCandidate);
  } catch {
    return reportFailure(
      dependencies,
      contextFailure("FILE_IO_ERROR", "The staging binding candidate could not be removed."),
    );
  }
  return reportFailure(dependencies, originalError);
}

async function reconcileFailedCreation(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
  paths: PersonalPaths,
  identity: ValidatedIdentity,
  credentials: ValidatedCleverCredentials,
  originalError: ContextError,
): Promise<number> {
  const applications = await loadApplications(dependencies, credentials, identity.ownerId);
  if (!applications.ok) {
    return reportFailure(
      dependencies,
      contextFailure(
        "REMOTE_APP_CONFLICT",
        "The failed staging creation could not be reconciled safely.",
      ),
    );
  }
  const matching = applications.value.filter(
    (application) => application.org_id === identity.ownerId && application.name === stagingName,
  );
  if (matching.length === 0) {
    try {
      await unlink(paths.bindingCandidate);
    } catch {
      return reportFailure(
        dependencies,
        contextFailure("FILE_IO_ERROR", "The staging binding candidate could not be removed."),
      );
    }
    return reportFailure(dependencies, originalError);
  }
  if (matching.length !== 1 || matching[0] === undefined) {
    return reportFailure(
      dependencies,
      contextFailure(
        "REMOTE_APP_CONFLICT",
        "The failed staging creation left an ambiguous remote state.",
      ),
    );
  }
  return await reportFailedCreation(
    dependencies,
    environment,
    paths,
    identity,
    credentials,
    matching[0].app_id,
    originalError,
  );
}

function validateApplicationEnvironment(value: unknown): ContextError | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return contextFailure("COMMAND_ERROR", "The staging environment response is malformed.");
  }
  const rawEnvironment = Reflect.get(value, "env");
  if (!Array.isArray(rawEnvironment)) {
    return contextFailure("COMMAND_ERROR", "The staging environment response is malformed.");
  }
  const environment = new Map<string, string>();
  for (const entry of rawEnvironment) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof Reflect.get(entry, "name") !== "string" ||
      typeof Reflect.get(entry, "value") !== "string"
    ) {
      return contextFailure("COMMAND_ERROR", "The staging environment response is malformed.");
    }
    environment.set(Reflect.get(entry, "name"), Reflect.get(entry, "value"));
  }
  if (
    staticApplicationEnvironment.some(
      ([name, expectedValue]) => environment.get(name) !== expectedValue,
    )
  ) {
    return contextFailure("COMMAND_ERROR", "The staging environment was not applied exactly.");
  }
  return null;
}

async function configureStaticApplication(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
): Promise<ContextError | null> {
  for (const [name, value] of staticApplicationEnvironment) {
    const result = await runCleverCaptured(
      dependencies,
      ["--no-update-notifier", "env", "set", name, value, "--alias", stagingAlias],
      { cwd: dependencies.cwd, environment, maxOutputBytes: 64 * 1024 },
    );
    if (capturedCommandFailed(result)) {
      return contextFailure("COMMAND_ERROR", "The staging environment could not be configured.");
    }
  }
  const result = await runCleverCaptured(
    dependencies,
    ["--no-update-notifier", "env", "--alias", stagingAlias, "--format", "json"],
    { cwd: dependencies.cwd, environment, maxOutputBytes: 64 * 1024 },
  );
  const json = parseCapturedJson(result);
  return json.ok ? validateApplicationEnvironment(json.value) : json.error;
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

  const gitError = await verifyGitState(dependencies, context.value.environment);
  if (gitError !== null) return reportFailure(dependencies, gitError);
  const gateError = await runQualityGates(dependencies);
  if (gateError !== null) return reportFailure(dependencies, gateError);

  const candidateEnvironment = buildIsolatedEnvironment({
    source: dependencies.environment,
    paths: context.value.paths,
    applicationConfigurationFile: context.value.paths.bindingCandidate,
  });
  const candidatePlaceholder = await writeJsonAtomically(
    context.value.paths.bindingCandidate,
    { apps: [] },
    0o600,
  );
  if (!candidatePlaceholder.ok) {
    return reportFailure(dependencies, candidatePlaceholder.error);
  }
  const created = await runCleverCaptured(
    dependencies,
    [
      "--no-update-notifier",
      "create",
      "--type",
      "static",
      stagingName,
      "--region",
      "par",
      "--alias",
      stagingAlias,
      "--format",
      "json",
    ],
    { cwd: dependencies.cwd, environment: candidateEnvironment },
  );
  if (capturedCommandFailed(created)) {
    return await reconcileFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      contextFailure("COMMAND_ERROR", "The personal staging application could not be created."),
    );
  }
  const creationReceipt = parseCreatedApplicationId(created);
  if (!creationReceipt.ok) {
    const discoveredApplications = await loadApplications(
      dependencies,
      context.value.credentials,
      context.value.identity.ownerId,
    );
    if (discoveredApplications.ok) {
      const discovered = validateRemoteApplication(
        discoveredApplications.value,
        context.value.identity,
      );
      if (discovered.ok) {
        return await reportFailedCreation(
          dependencies,
          context.value.environment,
          context.value.paths,
          context.value.identity,
          context.value.credentials,
          discovered.value.app_id,
          creationReceipt.error,
        );
      }
    }
    return reportFailure(
      dependencies,
      contextFailure(
        "REMOTE_APP_CONFLICT",
        "The staging creation result is ambiguous and requires manual verification.",
      ),
    );
  }

  const candidateMode = await validateProtectedPath(
    dependencies,
    context.value.paths.bindingCandidate,
    "secret",
  );
  if (!candidateMode.ok) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      candidateMode.error,
    );
  }
  const candidateJson = await readJsonFile(context.value.paths.bindingCandidate);
  if (!candidateJson.ok) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      candidateJson.error,
    );
  }
  const candidate = parseBinding(candidateJson.value);
  if (!candidate.ok) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      candidate.error,
    );
  }
  const binding = validateOptionalBinding(candidate.value, context.value.identity);
  if (!binding.ok || binding.value === null) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      binding.ok
        ? contextFailure("UNSAFE_BINDING", "The staging binding candidate is empty.")
        : binding.error,
    );
  }
  if (binding.value.app_id !== creationReceipt.value) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      contextFailure("UNSAFE_BINDING", "The creation receipt and binding differ."),
    );
  }

  const applications = await loadApplications(
    dependencies,
    context.value.credentials,
    context.value.identity.ownerId,
  );
  if (!applications.ok) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      applications.error,
    );
  }
  const remote = validateRemoteApplication(applications.value, context.value.identity);
  if (!remote.ok || remote.value.app_id !== binding.value.app_id) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      remote.ok
        ? contextFailure("UNSAFE_BINDING", "The created staging application does not match.")
        : remote.error,
    );
  }

  const configurationError = await configureStaticApplication(dependencies, candidateEnvironment);
  if (configurationError !== null) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      configurationError,
    );
  }

  const finalWrite = await writeJsonAtomically(
    context.value.paths.binding,
    candidateJson.value,
    0o600,
  );
  if (!finalWrite.ok) {
    return await reportFailedCreation(
      dependencies,
      context.value.environment,
      context.value.paths,
      context.value.identity,
      context.value.credentials,
      creationReceipt.value,
      finalWrite.error,
    );
  }
  try {
    await unlink(context.value.paths.bindingCandidate);
  } catch {
    return reportFailure(
      dependencies,
      contextFailure("FILE_IO_ERROR", "The staging binding candidate could not be removed."),
    );
  }
  dependencies.writeOutput("PASS: personal Paris staging application created and bound.");
  return 0;
}

async function verifyGitState(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
): Promise<ContextError | null> {
  async function git(...arguments_: string[]): Promise<CommandResult> {
    return await dependencies.runCaptured(dependencies.gitCommand, arguments_, {
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
  const fetch = await git("fetch", "--quiet", "origin", "main");
  if (fetch.exitCode !== 0) {
    return contextFailure("OUTDATED_MAIN", "The current origin/main state could not be verified.");
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
  const root = await dependencies.runCaptured(
    dependencies.gitCommand,
    ["rev-parse", "--show-toplevel"],
    {
      cwd: dependencies.cwd,
      environment,
    },
  );
  if (root.exitCode !== 0 || resolve(root.stdout.trim()) !== resolve(dependencies.cwd)) {
    return contextFailure("WRONG_REPOSITORY", "The command is not running at the repository root.");
  }

  const origin = await dependencies.runCaptured(
    dependencies.gitCommand,
    ["remote", "get-url", "origin"],
    {
      cwd: dependencies.cwd,
      environment,
    },
  );
  if (origin.exitCode !== 0 || origin.stdout.trim() !== expectedOrigin) {
    return contextFailure(
      "WRONG_REPOSITORY",
      "The Git origin is not the personal Website repository.",
    );
  }
  return null;
}

async function runQualityGates(
  dependencies: PersonalCleverDependencies,
): Promise<ContextError | null> {
  const gateEnvironment = buildSanitizedEnvironment(dependencies.environment);
  for (const gate of [
    ["run", "check"],
    ["run", "test:e2e"],
  ] as const) {
    const exitCode = await dependencies.runInteractive(dependencies.bunCommand, gate, {
      cwd: dependencies.cwd,
      environment: gateEnvironment,
    });
    if (exitCode !== 0) {
      return contextFailure("QUALITY_GATE_FAILED", "A required deployment gate failed.");
    }
  }
  return null;
}

async function verifyRollbackCommit(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
  commit: string,
): Promise<ContextError | null> {
  for (const arguments_ of [
    ["cat-file", "-e", `${commit}^{commit}`],
    ["merge-base", "--is-ancestor", commit, "origin/main"],
  ] as const) {
    const result = await dependencies.runCaptured(dependencies.gitCommand, arguments_, {
      cwd: dependencies.cwd,
      environment,
      maxOutputBytes: 64 * 1024,
    });
    if (capturedCommandFailed(result)) {
      return contextFailure(
        "ROLLBACK_COMMIT_REJECTED",
        "Rollback requires a commit from canonical main history.",
      );
    }
  }
  return null;
}

async function deployFromTemporaryClone(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
): Promise<{ error: ContextError | null; remoteMutationAttempted: boolean }> {
  let temporaryRoot: string;
  try {
    temporaryRoot = await mkdtemp(join(tmpdir(), "libre-ai-clever-deploy-"));
  } catch {
    return {
      error: contextFailure(
        "FILE_IO_ERROR",
        "A private deployment workspace could not be created.",
      ),
      remoteMutationAttempted: false,
    };
  }

  let result: ContextError | null = null;
  let remoteMutationAttempted = false;
  try {
    const repository = join(temporaryRoot, "repository");
    const clone = await dependencies.runCaptured(
      dependencies.gitCommand,
      [
        "clone",
        "--quiet",
        "--local",
        "--no-hardlinks",
        "--no-tags",
        "--single-branch",
        "--branch",
        "main",
        "--",
        dependencies.cwd,
        repository,
      ],
      {
        cwd: temporaryRoot,
        environment,
        maxOutputBytes: 64 * 1024,
      },
    );
    if (capturedCommandFailed(clone)) {
      result = contextFailure(
        "COMMAND_ERROR",
        "The private deployment clone could not be created.",
      );
    } else {
      remoteMutationAttempted = true;
      const deploy = await runCleverCaptured(
        dependencies,
        [
          "--no-update-notifier",
          "deploy",
          "--alias",
          stagingAlias,
          "--branch",
          "main",
          "--same-commit-policy",
          "rebuild",
          "--quiet",
          "--exit-on",
          "deploy-end",
        ],
        { cwd: repository, environment, maxOutputBytes: 256 * 1024 },
      );
      if (capturedCommandFailed(deploy)) {
        result = contextFailure("COMMAND_ERROR", "The personal staging deployment failed.");
      }
    }
  } catch {
    result = contextFailure("COMMAND_ERROR", "The personal staging deployment failed.");
  }

  try {
    await rm(temporaryRoot, { recursive: true, force: true });
  } catch {
    return {
      error: contextFailure(
        "FILE_IO_ERROR",
        "The private deployment workspace could not be removed.",
      ),
      remoteMutationAttempted,
    };
  }
  return { error: result, remoteMutationAttempted };
}

async function loadPublicApplicationUrl(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
): Promise<Result<string, ContextError>> {
  const result = await runCleverCaptured(
    dependencies,
    ["--no-update-notifier", "domain", "--alias", stagingAlias, "--format", "json"],
    { cwd: dependencies.cwd, environment, maxOutputBytes: 64 * 1024 },
  );
  const json = parseCapturedJson(result);
  if (!json.ok) return json;
  if (!Array.isArray(json.value)) {
    return {
      ok: false,
      error: contextFailure("COMMAND_ERROR", "The staging domain response is malformed."),
    };
  }
  const publicUrls: string[] = [];
  for (const entry of json.value) {
    if (typeof entry !== "object" || entry === null) {
      return {
        ok: false,
        error: contextFailure("COMMAND_ERROR", "The staging domain response is malformed."),
      };
    }
    const domain = Reflect.get(entry, "domainWithPathPrefix");
    if (typeof domain !== "string") {
      return {
        ok: false,
        error: contextFailure("COMMAND_ERROR", "The staging domain response is malformed."),
      };
    }
    try {
      const url = new URL(`https://${domain}`);
      if (
        url.username === "" &&
        url.password === "" &&
        url.port === "" &&
        url.pathname === "/" &&
        url.search === "" &&
        url.hash === "" &&
        url.hostname.endsWith(".cleverapps.io")
      ) {
        publicUrls.push(url.href);
      }
    } catch {
      return {
        ok: false,
        error: contextFailure("COMMAND_ERROR", "The staging domain response is malformed."),
      };
    }
  }
  if (publicUrls.length !== 1 || publicUrls[0] === undefined) {
    return {
      ok: false,
      error: contextFailure("UNSAFE_BINDING", "The staging public domain is not uniquely safe."),
    };
  }
  return { ok: true, value: publicUrls[0] };
}

async function readBoundedResponseBody(
  response: Response,
  maximumBodyBytes: number,
): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > maximumBodyBytes)
  ) {
    return null;
  }
  if (response.body === null) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBodyBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function matchesSmokeContract(path: (typeof smokePaths)[number], html: string): boolean {
  if (!html.includes("Content-Security-Policy")) return false;
  if (findRemoteAssetReferences(html).length > 0 || findExecutableMarkup(html).length > 0) {
    return false;
  }
  if (!html.includes('class="wordmark"') || !html.includes("Libre AI")) return false;
  if (path === "/") {
    return html.includes('class="primary-action"') && html.includes('class="action-boundary"');
  }
  if (path === "/comparaisons.html") return html.includes("Comparaisons datées");
  return html.includes("Possédez la fabrique.");
}

function hasRequiredSecurityHeaders(headers: Headers): boolean {
  return (
    headers.get("content-security-policy")?.includes("script-src 'none'") === true &&
    headers.get("cross-origin-opener-policy") === "same-origin" &&
    headers.get("cross-origin-resource-policy") === "same-origin" &&
    headers.get("referrer-policy") === "no-referrer" &&
    headers.get("x-content-type-options") === "nosniff" &&
    headers.get("x-frame-options") === "DENY"
  );
}

async function runPostDeploySmoke(
  dependencies: PersonalCleverDependencies,
  deployUrl: string,
): Promise<ContextError | null> {
  try {
    for (const path of smokePaths) {
      const response = await dependencies.fetchUrl(new URL(path, deployUrl).href, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(10_000),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (
        response.status !== 200 ||
        !contentType.startsWith("text/html") ||
        !hasRequiredSecurityHeaders(response.headers)
      ) {
        return contextFailure("SMOKE_TEST_FAILED", "The personal staging smoke test failed.");
      }
      const body = await readBoundedResponseBody(response, maximumSmokeBodyBytes);
      if (body === null || !matchesSmokeContract(path, body)) {
        return contextFailure("SMOKE_TEST_FAILED", "The personal staging smoke test failed.");
      }
    }
    return null;
  } catch {
    return contextFailure("SMOKE_TEST_FAILED", "The personal staging smoke test failed.");
  }
}

async function stopAfterPostDeployFailure(
  dependencies: PersonalCleverDependencies,
  environment: Record<string, string>,
  applicationId: string,
  originalError: ContextError,
): Promise<number> {
  const stopResult = await runCleverCaptured(
    dependencies,
    ["--no-update-notifier", "stop", "--alias", stagingAlias],
    {
      cwd: dependencies.cwd,
      environment,
      maxOutputBytes: 64 * 1024,
    },
  );
  if (capturedCommandFailed(stopResult)) {
    return reportFailure(
      dependencies,
      contextFailure(
        originalError.code,
        "Post-deployment verification failed and automatic stop could not be verified.",
      ),
    );
  }
  const statusResult = await runCleverCaptured(
    dependencies,
    ["--no-update-notifier", "status", "--alias", stagingAlias, "--format", "json"],
    {
      cwd: dependencies.cwd,
      environment,
      maxOutputBytes: 64 * 1024,
    },
  );
  const status = parseCapturedJson(statusResult);
  const stopWasVerified =
    status.ok &&
    typeof status.value === "object" &&
    status.value !== null &&
    !Array.isArray(status.value) &&
    Reflect.get(status.value, "id") === applicationId &&
    Reflect.get(status.value, "name") === stagingName &&
    Reflect.get(status.value, "status") === "stopped" &&
    [undefined, null, false].includes(Reflect.get(status.value, "deploymentInProgress"));
  return reportFailure(
    dependencies,
    !stopWasVerified
      ? contextFailure(
          originalError.code,
          "Post-deployment verification failed and automatic stop could not be verified.",
        )
      : contextFailure(
          originalError.code,
          "Post-deployment verification failed and staging was stopped.",
        ),
  );
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
    const gateError = await runQualityGates(dependencies);
    if (gateError !== null) return reportFailure(dependencies, gateError);
    const deployment = await deployFromTemporaryClone(dependencies, context.value.environment);
    if (deployment.error !== null) {
      return deployment.remoteMutationAttempted
        ? await stopAfterPostDeployFailure(
            dependencies,
            context.value.environment,
            context.value.binding.app_id,
            deployment.error,
          )
        : reportFailure(dependencies, deployment.error);
    }
    const publicUrl = await loadPublicApplicationUrl(dependencies, context.value.environment);
    if (!publicUrl.ok) {
      return await stopAfterPostDeployFailure(
        dependencies,
        context.value.environment,
        context.value.binding.app_id,
        publicUrl.error,
      );
    }
    const smokeError = await runPostDeploySmoke(dependencies, publicUrl.value);
    if (smokeError !== null) {
      return await stopAfterPostDeployFailure(
        dependencies,
        context.value.environment,
        context.value.binding.app_id,
        smokeError,
      );
    }
    dependencies.writeOutput("PASS: personal staging deployment and smoke verified.");
    return 0;
  }

  const fixedArguments: Record<string, readonly string[]> = {
    status: ["--no-update-notifier", "status", "--alias", stagingAlias],
    activity: ["--no-update-notifier", "activity", "--alias", stagingAlias],
    "stop-staging": ["--no-update-notifier", "stop", "--alias", stagingAlias],
  };
  const commandArguments = fixedArguments[operation];
  if (commandArguments !== undefined) {
    const result = await runCleverCaptured(dependencies, commandArguments, {
      cwd: dependencies.cwd,
      environment: context.value.environment,
    });
    return result.exitCode === 0 && !result.stdoutTruncated && !result.stderrTruncated
      ? 0
      : reportFailure(
          dependencies,
          contextFailure("COMMAND_ERROR", "The isolated Clever operation failed."),
        );
  }

  const commit = arguments_[0];
  if (
    operation !== "rollback-staging" ||
    arguments_.length !== 1 ||
    !/^[0-9a-f]{40}$/.test(commit ?? "")
  ) {
    return 2;
  }
  const rollbackCommit = commit ?? "";
  const gitError = await verifyGitState(dependencies, context.value.environment);
  if (gitError !== null) return reportFailure(dependencies, gitError);
  const commitError = await verifyRollbackCommit(
    dependencies,
    context.value.environment,
    rollbackCommit,
  );
  if (commitError !== null) return reportFailure(dependencies, commitError);
  const gateError = await runQualityGates(dependencies);
  if (gateError !== null) return reportFailure(dependencies, gateError);
  const rollbackResult = await runCleverCaptured(
    dependencies,
    [
      "--no-update-notifier",
      "restart",
      "--alias",
      stagingAlias,
      "--commit",
      rollbackCommit,
      "--exit-on",
      "deploy-end",
    ],
    {
      cwd: dependencies.cwd,
      environment: context.value.environment,
      maxOutputBytes: 256 * 1024,
    },
  );
  if (capturedCommandFailed(rollbackResult)) {
    return await stopAfterPostDeployFailure(
      dependencies,
      context.value.environment,
      context.value.binding.app_id,
      contextFailure("COMMAND_ERROR", "The isolated Clever rollback failed."),
    );
  }
  const publicUrl = await loadPublicApplicationUrl(dependencies, context.value.environment);
  if (!publicUrl.ok) {
    return await stopAfterPostDeployFailure(
      dependencies,
      context.value.environment,
      context.value.binding.app_id,
      publicUrl.error,
    );
  }
  const smokeError = await runPostDeploySmoke(dependencies, publicUrl.value);
  if (smokeError !== null) {
    return await stopAfterPostDeployFailure(
      dependencies,
      context.value.environment,
      context.value.binding.app_id,
      smokeError,
    );
  }
  dependencies.writeOutput("PASS: personal staging rollback and smoke verified.");
  return 0;
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

  try {
    if (operation === "doctor") return await runDoctor(dependencies);
    if (operation === "login") return await runLogin(dependencies);
    if (operation === "create-staging") return await runCreateStaging(dependencies);
    return await runBoundOperation(operation, operationArguments, dependencies);
  } catch {
    return reportFailure(
      dependencies,
      contextFailure("FILE_IO_ERROR", "The personal Clever operation could not complete safely."),
    );
  }
}

if (import.meta.main) {
  process.exitCode = await runPersonalClever(process.argv.slice(2));
}
