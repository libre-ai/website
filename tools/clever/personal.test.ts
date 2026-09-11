import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { type PersonalCleverDependencies, runPersonalClever } from "./personal";
import { type CommandOptions, type CommandResult, resolvePersonalPaths } from "./runtime";

interface RecordedCall {
  kind: "captured" | "interactive";
  command: string;
  arguments: readonly string[];
  options: CommandOptions;
}

interface FakeState {
  profile: Record<string, unknown>;
  applications: readonly Record<string, unknown>[];
  gitOrigin: string;
  dirtyGit: boolean;
  loginCreatesCredentials: boolean;
  failingInteractive: string | null;
  failingCaptured: string | null;
  smokeFailurePath: string | null;
  cleverVersion: string;
  candidateBinding: unknown;
  candidateRawText: string | null;
  candidateModeAfterCreate: number | null;
  createReceipt: unknown;
  createExitCode: number;
  createCreatesRemote: boolean;
  createdApplications: readonly Record<string, unknown>[] | null;
  applicationEnvironment: Record<string, string>;
  domains: unknown;
  environmentResponse: unknown | null;
  failDeploy: boolean;
  stoppedStatus: string;
  deploymentInProgress: boolean;
  rollbackCommitAllowed: boolean;
  credentialsModeAtLogin: number | null;
  candidateModeAtCreate: number | null;
  apiFailureAtCall: number | null;
  apiFailureMode: "status" | "content-type" | "oversized" | "malformed" | "throw" | null;
  apiCallCount: number;
  gitBranch: string;
  gitRoot: string;
  headCommit: string;
  remoteHeadCommit: string;
  deleteKeepsApplication: boolean;
  failClone: boolean;
  blockFinalBindingWrite: boolean;
  candidateUnlinkFails: boolean;
  throwCaptured: string | null;
}

const temporaryDirectories: string[] = [];
const personalEmail = "owner@personal.example.test";
const personalUserId = "user_personal_fixture";

async function createTemporaryHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "libre-ai-clever-personal-"));
  temporaryDirectories.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

function commandResult(stdout = "", exitCode = 0, stderr = ""): CommandResult {
  return {
    exitCode,
    stdout,
    stderr,
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function validProfile(): Record<string, unknown> {
  return {
    alias: "libre-ai-personal",
    id: personalUserId,
    email: personalEmail,
    has2FA: true,
    isProfileActive: true,
    isTokenValid: true,
  };
}

function validCredentials(): Record<string, unknown> {
  return {
    version: 1,
    profiles: [
      {
        alias: "libre-ai-personal",
        token: "opaque-fixture-one",
        secret: "opaque-fixture-two",
        userId: personalUserId,
        email: personalEmail,
      },
    ],
  };
}

function validApplication(): Record<string, unknown> {
  return {
    app_id: "app_staging_fixture",
    org_id: personalUserId,
    name: "libre-ai-website-staging",
    zone: "par",
    type: "static",
    createdAt: "2026-09-10T12:00:00.000Z",
    deploy_url: "https://push.par.clever-cloud.com/app_staging_fixture.git",
    git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_staging_fixture.git",
  };
}

function validBinding(): Record<string, unknown> {
  const application = validApplication();
  return {
    apps: [
      {
        app_id: application.app_id,
        org_id: application.org_id,
        name: application.name,
        deploy_url: application.deploy_url,
        git_ssh_url: application.git_ssh_url,
        alias: "website-staging",
      },
    ],
  };
}

async function writeProtectedContext(home: string, withBinding = false): Promise<void> {
  const paths = resolvePersonalPaths(home);
  await mkdir(paths.configDirectory, { recursive: true, mode: 0o700 });
  await mkdir(paths.runtimeHome, { recursive: true, mode: 0o700 });
  await mkdir(paths.xdgConfigHome, { recursive: true, mode: 0o700 });
  await mkdir(paths.xdgCacheHome, { recursive: true, mode: 0o700 });
  await mkdir(paths.xdgDataHome, { recursive: true, mode: 0o700 });
  await Bun.write(
    paths.policy,
    JSON.stringify({
      version: 1,
      expectedEmail: personalEmail,
      expectedUserId: personalUserId,
      expectedOwnerId: personalUserId,
    }),
  );
  await Bun.write(paths.credentials, JSON.stringify(validCredentials()));
  if (withBinding) await Bun.write(paths.binding, JSON.stringify(validBinding()));

  await chmod(paths.configDirectory, 0o700);
  await chmod(paths.policy, 0o600);
  await chmod(paths.credentials, 0o600);
  if (withBinding) await chmod(paths.binding, 0o600);
}

function createDependencies(
  home: string,
  stateOverrides: Partial<FakeState> = {},
  environment: Record<string, string | undefined> = {},
): {
  dependencies: PersonalCleverDependencies;
  calls: RecordedCall[];
  output: string[];
  errors: string[];
  state: FakeState;
  fetchedUrls: string[];
  apiUrls: string[];
  apiAuthorizationHeaders: Array<string | null>;
} {
  const calls: RecordedCall[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const fetchedUrls: string[] = [];
  const apiUrls: string[] = [];
  const apiAuthorizationHeaders: Array<string | null> = [];
  const state: FakeState = {
    profile: validProfile(),
    applications: [],
    gitOrigin: "https://github.com/libre-ai/website.git",
    dirtyGit: false,
    loginCreatesCredentials: true,
    failingInteractive: null,
    failingCaptured: null,
    smokeFailurePath: null,
    cleverVersion: "4.11.0",
    candidateBinding: validBinding(),
    candidateRawText: null,
    candidateModeAfterCreate: null,
    createReceipt: {
      id: "app_staging_fixture",
      name: "libre-ai-website-staging",
      executedAs: "REGULAR",
      env: [],
      deployUrl: "https://push.par.clever-cloud.com/app_staging_fixture.git",
    },
    createExitCode: 0,
    createCreatesRemote: true,
    createdApplications: null,
    applicationEnvironment: {},
    domains: [
      {
        domainWithPathPrefix: "app-staging-fixture.cleverapps.io",
        hostname: "app-staging-fixture.cleverapps.io",
        pathPrefix: "/",
        isFavourite: false,
      },
    ],
    environmentResponse: null,
    failDeploy: false,
    stoppedStatus: "stopped",
    deploymentInProgress: false,
    rollbackCommitAllowed: true,
    credentialsModeAtLogin: null,
    candidateModeAtCreate: null,
    apiFailureAtCall: null,
    apiFailureMode: null,
    apiCallCount: 0,
    gitBranch: "main",
    gitRoot: "/repo",
    headCommit: "a".repeat(40),
    remoteHeadCommit: "a".repeat(40),
    deleteKeepsApplication: false,
    failClone: false,
    blockFinalBindingWrite: false,
    candidateUnlinkFails: false,
    throwCaptured: null,
    ...stateOverrides,
  };
  const paths = resolvePersonalPaths(home);
  async function runCapturedFake(
    command: string,
    arguments_: readonly string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    calls.push({ kind: "captured", command, arguments: arguments_, options });
    if (`${command} ${arguments_.join(" ")}` === state.throwCaptured) {
      throw new Error("fixture subprocess failure");
    }
    if (`${command} ${arguments_.join(" ")}` === state.failingCaptured) {
      return commandResult("", 1, `${personalEmail} ${personalUserId}`);
    }
    if (command === "clever" && arguments_.includes("--version")) {
      return commandResult(`${state.cleverVersion}\n`);
    }
    if (command === "clever" && arguments_.includes("login")) {
      state.credentialsModeAtLogin = (await stat(paths.credentials)).mode & 0o777;
      if (state.loginCreatesCredentials) {
        await Bun.write(paths.credentials, JSON.stringify(validCredentials()));
      }
      return commandResult(`${personalEmail} ${personalUserId}\n`);
    }
    if (command === "clever" && arguments_.includes("profile")) {
      return commandResult(`${JSON.stringify(state.profile)}\n`);
    }
    if (command === "clever" && arguments_.includes("env") && arguments_.includes("set")) {
      const setIndex = arguments_.indexOf("set");
      const name = arguments_[setIndex + 1];
      const value = arguments_[setIndex + 2];
      if (name === undefined || value === undefined) return commandResult("", 1);
      state.applicationEnvironment[name] = value;
      return commandResult(`${personalEmail} ${personalUserId}\n`);
    }
    if (command === "clever" && arguments_.includes("env")) {
      if (state.blockFinalBindingWrite) {
        await mkdir(paths.binding);
      }
      if (state.candidateUnlinkFails) {
        await rm(paths.bindingCandidate);
        await mkdir(paths.bindingCandidate);
      }
      if (state.environmentResponse !== null) {
        return commandResult(`${JSON.stringify(state.environmentResponse)}\n`);
      }
      return commandResult(
        `${JSON.stringify({
          env: Object.entries(state.applicationEnvironment).map(([name, value]) => ({
            name,
            value,
          })),
          fromAddons: [],
          fromDependencies: [],
        })}\n`,
      );
    }
    if (command === "clever" && arguments_.includes("domain")) {
      return commandResult(`${JSON.stringify(state.domains)}\n`);
    }
    if (command === "clever" && arguments_.includes("status") && arguments_.includes("--format")) {
      return commandResult(
        `${JSON.stringify({
          id: "app_staging_fixture",
          name: "libre-ai-website-staging",
          status: state.stoppedStatus,
          deploymentInProgress: state.deploymentInProgress,
        })}\n`,
      );
    }
    if (command === "clever" && arguments_.includes("delete")) {
      if (!state.deleteKeepsApplication) state.applications = [];
      return commandResult();
    }
    if (command === "clever" && arguments_.includes("deploy") && state.failDeploy) {
      return commandResult("", 1, `${personalEmail} ${personalUserId}`);
    }
    if (command === "clever" && arguments_.includes("create")) {
      const candidate = options.environment?.APP_CONFIGURATION_FILE;
      if (candidate === undefined) return commandResult("", 1, "candidate missing");
      state.candidateModeAtCreate = (await stat(candidate)).mode & 0o777;
      if (state.createCreatesRemote) {
        state.applications = state.createdApplications ?? [validApplication()];
      }
      if (state.createExitCode !== 0) {
        return commandResult("", state.createExitCode, `${personalEmail} ${personalUserId}`);
      }
      await Bun.write(candidate, state.candidateRawText ?? JSON.stringify(state.candidateBinding));
      if (state.candidateModeAfterCreate !== null) {
        await chmod(candidate, state.candidateModeAfterCreate);
      }
      return commandResult(`${JSON.stringify(state.createReceipt)}\n`);
    }
    if (command === "git") {
      if (arguments_[0] === "clone" && state.failClone) return commandResult("", 1);
      const gitOperation = arguments_.join(" ");
      if (gitOperation === "rev-parse --show-toplevel") return commandResult(`${state.gitRoot}\n`);
      if (gitOperation === "remote get-url origin") {
        return commandResult(`${state.gitOrigin}\n`);
      }
      if (gitOperation === "branch --show-current") return commandResult(`${state.gitBranch}\n`);
      if (gitOperation === "status --porcelain") {
        return commandResult(state.dirtyGit ? " M tracked-file\n" : "");
      }
      if (gitOperation === "rev-parse HEAD") return commandResult(`${state.headCommit}\n`);
      if (gitOperation === "rev-parse origin/main") {
        return commandResult(`${state.remoteHeadCommit}\n`);
      }
      if (gitOperation.startsWith("cat-file -e ")) {
        return commandResult("", state.rollbackCommitAllowed ? 0 : 1);
      }
      if (gitOperation.startsWith("merge-base --is-ancestor ")) {
        return commandResult("", state.rollbackCommitAllowed ? 0 : 1);
      }
    }
    return commandResult();
  }

  const dependencies: PersonalCleverDependencies = {
    bunCommand: "bun",
    cleverCommand: "clever",
    cleverArgumentsPrefix: [],
    gitCommand: "git",
    home,
    cwd: "/repo",
    environment,
    runCaptured: runCapturedFake,
    runInteractive: async (command, arguments_, options = {}) => {
      calls.push({ kind: "interactive", command, arguments: arguments_, options });
      if (`${command} ${arguments_.join(" ")}` === state.failingInteractive) return 1;
      return 0;
    },
    fetchUrl: async (url, init) => {
      if (url === "https://api.clever-cloud.com/v2/self/applications") {
        state.apiCallCount += 1;
        apiUrls.push(url);
        apiAuthorizationHeaders.push(new Headers(init.headers).get("authorization"));
        if (state.apiFailureAtCall === state.apiCallCount) {
          if (state.apiFailureMode === "throw") throw new Error("fixture API failure");
          if (state.apiFailureMode === "status") {
            return new Response("unavailable", {
              status: 503,
              headers: { "content-type": "text/plain" },
            });
          }
          if (state.apiFailureMode === "content-type") {
            return new Response("[]", {
              status: 200,
              headers: { "content-type": "text/plain" },
            });
          }
          if (state.apiFailureMode === "oversized") {
            return new Response("[]", {
              status: 200,
              headers: {
                "content-type": "application/json",
                "content-length": String(1024 * 1024 + 1),
              },
            });
          }
          if (state.apiFailureMode === "malformed") {
            return new Response("{", {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
        }
        return new Response(
          JSON.stringify(
            state.applications.map((application) => ({
              id: application.app_id,
              name: application.name,
              zone: application.zone,
              instance: { variant: { slug: application.type } },
              creationDate: Date.parse(String(application.createdAt)),
              deployment: {
                httpUrl: application.deploy_url,
                url: application.git_ssh_url,
              },
            })),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      fetchedUrls.push(url);
      const path = new URL(url).pathname;
      if (path === state.smokeFailurePath) {
        return new Response("unavailable", {
          status: 503,
          headers: { "content-type": "text/plain" },
        });
      }
      const pageMarker =
        path === "/comparaisons.html"
          ? "Comparaisons datées"
          : path === "/marque.html"
            ? "Possédez la fabrique."
            : '<a class="primary-action"></a><p class="action-boundary"></p>';
      return new Response(
        `<meta http-equiv="Content-Security-Policy"><a class="wordmark">Libre AI</a>${pageMarker}`,
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": "default-src 'self'; script-src 'none'",
            "cross-origin-opener-policy": "same-origin",
            "cross-origin-resource-policy": "same-origin",
            "referrer-policy": "no-referrer",
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
          },
        },
      );
    },
    writeOutput: (message) => output.push(message),
    writeError: (message) => errors.push(message),
  };
  return {
    dependencies,
    calls,
    output,
    errors,
    state,
    fetchedUrls,
    apiUrls,
    apiAuthorizationHeaders,
  };
}

describe("personal Clever doctor", () => {
  test("passes only the isolated exact account and redacts all identity values", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, output, errors, apiUrls, apiAuthorizationHeaders } =
      createDependencies(home);

    expect(await runPersonalClever(["doctor"], dependencies)).toBe(0);
    expect(errors).toEqual([]);
    expect(output.join("\n")).toContain("PASS");
    expect(output.join("\n")).not.toContain(personalEmail);
    expect(output.join("\n")).not.toContain(personalUserId);
    expect(
      calls.every((call) => call.options.environment?.CONFIGURATION_FILE?.startsWith(home)),
    ).toBe(true);
    expect(apiUrls).toEqual(["https://api.clever-cloud.com/v2/self/applications"]);
    expect(apiAuthorizationHeaders[0]?.startsWith("OAuth ")).toBe(true);
    expect(calls.some((call) => call.arguments.includes("applications"))).toBe(false);
    const paths = resolvePersonalPaths(home);
    expect(
      calls
        .filter((call) => call.command === "clever")
        .every(
          (call) =>
            call.options.environment?.HOME === paths.runtimeHome &&
            call.options.environment?.XDG_CONFIG_HOME === paths.xdgConfigHome,
        ),
    ).toBe(true);
  });

  test("refuses disabled 2FA before any mutating command", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, {
      profile: { ...validProfile(), has2FA: false },
    });

    expect(await runPersonalClever(["doctor"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("TWO_FACTOR_REQUIRED");
    expect(calls.some((call) => call.arguments.includes("create"))).toBe(false);
    expect(errors.join("\n")).not.toContain(personalEmail);
  });

  test("refuses inherited credential or endpoint overrides before invoking Clever", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(
      home,
      {},
      {
        CLEVER_TOKEN: "wrong-token",
        API_HOST: "https://wrong.example.test",
      },
    );

    expect(await runPersonalClever(["doctor"], dependencies)).toBe(1);
    expect(calls).toEqual([]);
    expect(errors.join("\n")).toContain("UNSAFE_ENVIRONMENT");
    expect(errors.join("\n")).not.toContain("wrong-token");
  });

  test("refuses disabled TLS verification before invoking Clever", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(
      home,
      {},
      {
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
    );

    expect(await runPersonalClever(["doctor"], dependencies)).toBe(1);
    expect(calls).toEqual([]);
    expect(errors.join("\n")).toContain("UNSAFE_ENVIRONMENT");
  });

  test("refuses a different repository before querying Clever", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, {
      gitOrigin: "https://github.com/example/other.git",
    });

    expect(await runPersonalClever(["doctor"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("WRONG_REPOSITORY");
    expect(calls.some((call) => call.command === "clever")).toBe(false);
  });

  test("fails closed on every invalid Personal Space API response", async () => {
    for (const apiFailureMode of [
      "status",
      "content-type",
      "oversized",
      "malformed",
      "throw",
    ] as const) {
      const home = await createTemporaryHome();
      await writeProtectedContext(home);
      const { dependencies, errors } = createDependencies(home, {
        apiFailureAtCall: 1,
        apiFailureMode,
      });

      expect(await runPersonalClever(["doctor"], dependencies)).toBe(1);
      expect(errors.join("\n")).toContain("COMMAND_ERROR");
    }
  });

  test("refuses an unavailable pinned Clever version", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, errors } = createDependencies(home, { cleverVersion: "4.12.0" });

    expect(await runPersonalClever(["doctor"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
  });

  test("refuses unbound or mismatched remote staging state", async () => {
    const unboundHome = await createTemporaryHome();
    await writeProtectedContext(unboundHome);
    const unbound = createDependencies(unboundHome, { applications: [validApplication()] });
    expect(await runPersonalClever(["doctor"], unbound.dependencies)).toBe(1);
    expect(unbound.errors.join("\n")).toContain("REMOTE_APP_CONFLICT");

    const mismatchedHome = await createTemporaryHome();
    await writeProtectedContext(mismatchedHome, true);
    const mismatched = createDependencies(mismatchedHome, {
      applications: [
        {
          ...validApplication(),
          app_id: "app_different_fixture",
          deploy_url: "https://push.par.clever-cloud.com/app_different_fixture.git",
          git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_different_fixture.git",
        },
      ],
    });
    expect(await runPersonalClever(["doctor"], mismatched.dependencies)).toBe(1);
    expect(mismatched.errors.join("\n")).toContain("UNSAFE_BINDING");
  });
});

describe("personal Clever enrollment", () => {
  test("enrolls the exact isolated identity in dedicated storage", async () => {
    const home = await createTemporaryHome();
    const { dependencies, calls, errors, state } = createDependencies(
      home,
      {},
      {
        LIBRE_AI_CLEVER_EXPECTED_EMAIL: personalEmail,
      },
    );
    const paths = resolvePersonalPaths(home);

    expect(await runPersonalClever(["login"], dependencies)).toBe(0);
    expect(errors).toEqual([]);
    expect(JSON.parse(await readFile(paths.policy, "utf8"))).toEqual({
      version: 1,
      expectedEmail: personalEmail,
      expectedUserId: personalUserId,
      expectedOwnerId: personalUserId,
    });
    expect((await stat(paths.credentials)).mode & 0o777).toBe(0o600);
    expect(state.credentialsModeAtLogin).toBe(0o600);
    expect(
      calls.some((call) => call.command === "clever" && call.arguments.includes("login")),
    ).toBe(true);
    expect((await stat(paths.runtimeHome)).mode & 0o777).toBe(0o700);
    expect((await stat(paths.xdgConfigHome)).mode & 0o777).toBe(0o700);
    expect(
      calls.every((call) => call.options.environment?.LIBRE_AI_CLEVER_EXPECTED_EMAIL === undefined),
    ).toBe(true);
  });

  test("refuses success when login does not create isolated credentials", async () => {
    const home = await createTemporaryHome();
    const { dependencies, errors } = createDependencies(
      home,
      { loginCreatesCredentials: false },
      { LIBRE_AI_CLEVER_EXPECTED_EMAIL: personalEmail },
    );

    expect(await runPersonalClever(["login"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    await expect(stat(resolvePersonalPaths(home).credentials)).rejects.toThrow();
  });

  test("cleans protected credentials when the isolated login command fails", async () => {
    const home = await createTemporaryHome();
    const { dependencies, errors } = createDependencies(
      home,
      { failingCaptured: "clever --no-update-notifier login --alias libre-ai-personal" },
      { LIBRE_AI_CLEVER_EXPECTED_EMAIL: personalEmail },
    );

    expect(await runPersonalClever(["login"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    await expect(stat(resolvePersonalPaths(home).credentials)).rejects.toThrow();
  });

  test("refuses malformed protected credentials without replacing them", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const paths = resolvePersonalPaths(home);
    await Bun.write(paths.credentials, JSON.stringify({ version: 1, profiles: [] }));
    await chmod(paths.credentials, 0o600);
    const { dependencies, errors } = createDependencies(home);

    expect(await runPersonalClever(["login"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("UNSAFE_CREDENTIALS");
  });

  test("refuses permissive pre-existing credentials instead of repairing them", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const paths = resolvePersonalPaths(home);
    await chmod(paths.credentials, 0o644);
    const { dependencies, calls, errors } = createDependencies(home);

    expect(await runPersonalClever(["login"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("UNSAFE_FILE_MODE");
    expect(
      calls
        .filter((call) => call.command === "clever")
        .every((call) => call.arguments.includes("--version")),
    ).toBe(true);
  });
});

describe("personal Clever staging operations", () => {
  test("creates only the fixed personal static Paris staging binding", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, state } = createDependencies(home);
    const paths = resolvePersonalPaths(home);

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(0);
    expect(JSON.parse(await readFile(paths.binding, "utf8"))).toEqual(validBinding());
    const createCall = calls.find((call) => call.arguments.includes("create"));
    expect(createCall?.arguments).toEqual([
      "--no-update-notifier",
      "create",
      "--type",
      "static",
      "libre-ai-website-staging",
      "--region",
      "par",
      "--alias",
      "website-staging",
      "--format",
      "json",
    ]);
    expect(createCall?.options.environment?.APP_CONFIGURATION_FILE).toBe(paths.bindingCandidate);
    expect(state.candidateModeAtCreate).toBe(0o600);
    const environmentSets = calls
      .filter(
        (call) =>
          call.command === "clever" &&
          call.arguments.includes("env") &&
          call.arguments.includes("set"),
      )
      .map((call) => call.arguments.slice(3, 5));
    expect(environmentSets).toEqual([
      ["CC_BUILD_COMMAND", "true"],
      ["CC_STATIC_SERVER", "caddy"],
      ["CC_WEBROOT", "/site"],
      ["CC_HEALTH_CHECK_PATH_0", "/"],
      ["CC_HEALTH_CHECK_PATH_1", "/comparaisons.html"],
      ["CC_HEALTH_CHECK_PATH_2", "/marque.html"],
    ]);
    expect(
      calls.some(
        (call) =>
          call.command === "clever" &&
          call.arguments.join(" ") ===
            "--no-update-notifier env --alias website-staging --format json",
      ),
    ).toBe(true);
    expect(
      calls
        .filter(
          (call) =>
            call.command === "clever" &&
            call.arguments.includes("env") &&
            call.arguments.includes("set"),
        )
        .every((call) => call.arguments.at(-2) === "--alias"),
    ).toBe(true);
  });

  test("refuses creation when staging is already bound or a candidate is stale", async () => {
    const boundHome = await createTemporaryHome();
    await writeProtectedContext(boundHome, true);
    const bound = createDependencies(boundHome, { applications: [validApplication()] });
    expect(await runPersonalClever(["create-staging"], bound.dependencies)).toBe(1);
    expect(bound.errors.join("\n")).toContain("REMOTE_APP_CONFLICT");
    expect(bound.calls.some((call) => call.arguments.includes("create"))).toBe(false);

    const staleHome = await createTemporaryHome();
    await writeProtectedContext(staleHome);
    const stalePaths = resolvePersonalPaths(staleHome);
    await Bun.write(stalePaths.bindingCandidate, JSON.stringify({ apps: [] }));
    await chmod(stalePaths.bindingCandidate, 0o600);
    const stale = createDependencies(staleHome);
    expect(await runPersonalClever(["create-staging"], stale.dependencies)).toBe(1);
    expect(stale.errors.join("\n")).toContain("UNSAFE_BINDING");
    expect(stale.calls.some((call) => call.arguments.includes("create"))).toBe(false);
  });

  test("rolls back a malformed creation receipt", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, { createReceipt: [] });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    expect(calls.some((call) => call.arguments.includes("delete"))).toBe(true);
  });

  test("rolls back an unsafe creation receipt endpoint", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, {
      createReceipt: {
        id: "app_staging_fixture",
        name: "libre-ai-website-staging",
        deployUrl: "not a URL",
      },
    });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    expect(calls.some((call) => call.arguments.includes("delete"))).toBe(true);
  });

  test("rolls back unsafe or malformed candidate files", async () => {
    const fixtures: Partial<FakeState>[] = [
      { candidateModeAfterCreate: 0o644 },
      { candidateRawText: "{" },
      { candidateBinding: { unexpected: true } },
    ];
    for (const fixture of fixtures) {
      const home = await createTemporaryHome();
      await writeProtectedContext(home);
      const { dependencies, calls, errors } = createDependencies(home, fixture);

      expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
      expect(errors.length).toBeGreaterThan(0);
      expect(calls.some((call) => call.arguments.includes("delete"))).toBe(true);
    }
  });

  test("fails closed when creation rollback cannot query, delete, or verify absence", async () => {
    const fixtures: Partial<FakeState>[] = [
      { candidateBinding: { apps: [] }, apiFailureAtCall: 2, apiFailureMode: "status" },
      {
        candidateBinding: { apps: [] },
        failingCaptured: "clever --no-update-notifier delete --alias website-staging --yes",
      },
      { candidateBinding: { apps: [] }, deleteKeepsApplication: true },
    ];
    for (const fixture of fixtures) {
      const home = await createTemporaryHome();
      await writeProtectedContext(home);
      const { dependencies, errors } = createDependencies(home, fixture);

      expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
      expect(errors.join("\n")).toContain("REMOTE_APP_CONFLICT");
    }
  });

  test("rolls back receipt, inventory, and remote identity mismatches", async () => {
    const mismatchedBinding = validBinding();
    const mismatchedApplication = {
      ...validApplication(),
      app_id: "app_different_fixture",
      deploy_url: "https://push.par.clever-cloud.com/app_different_fixture.git",
      git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_different_fixture.git",
    };
    const fixtures: Partial<FakeState>[] = [
      {
        candidateBinding: {
          apps: [
            {
              ...(mismatchedBinding.apps as Array<Record<string, unknown>>)[0],
              app_id: "app_different_fixture",
              deploy_url: "https://push.par.clever-cloud.com/app_different_fixture.git",
              git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_different_fixture.git",
            },
          ],
        },
      },
      { apiFailureAtCall: 2, apiFailureMode: "status" },
      { createdApplications: [mismatchedApplication] },
    ];
    for (const fixture of fixtures) {
      const home = await createTemporaryHome();
      await writeProtectedContext(home);
      const { dependencies, errors } = createDependencies(home, fixture);

      expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  test("rolls back malformed or incomplete static environment readback", async () => {
    for (const environmentResponse of [
      "invalid",
      { env: "invalid" },
      { env: [null] },
      { env: [] },
    ]) {
      const home = await createTemporaryHome();
      await writeProtectedContext(home);
      const { dependencies, calls, errors } = createDependencies(home, { environmentResponse });

      expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
      expect(errors.join("\n")).toContain("COMMAND_ERROR");
      expect(calls.some((call) => call.arguments.includes("delete"))).toBe(true);
    }
  });

  test("rolls back when explicit Caddy configuration fails", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, {
      failingCaptured:
        "clever --no-update-notifier env set CC_STATIC_SERVER caddy --alias website-staging",
    });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    expect(
      calls.some(
        (call) =>
          call.arguments.join(" ") === "--no-update-notifier delete --alias website-staging --yes",
      ),
    ).toBe(true);
  });

  test("reconciles and deletes an application created before a failed create response", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, {
      createExitCode: 1,
      createCreatesRemote: true,
    });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    expect(
      calls.some(
        (call) =>
          call.arguments.join(" ") === "--no-update-notifier delete --alias website-staging --yes",
      ),
    ).toBe(true);
  });

  test("removes the protected candidate when create fails before remote mutation", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, {
      createExitCode: 1,
      createCreatesRemote: false,
    });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    expect(calls.some((call) => call.arguments.includes("delete"))).toBe(false);
    await expect(stat(resolvePersonalPaths(home).bindingCandidate)).rejects.toThrow();
  });

  test("fails closed when create failure inventory is unavailable or ambiguous", async () => {
    const secondApplication = {
      ...validApplication(),
      app_id: "app_second_fixture",
      deploy_url: "https://push.par.clever-cloud.com/app_second_fixture.git",
      git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_second_fixture.git",
    };
    const fixtures: Partial<FakeState>[] = [
      {
        createExitCode: 1,
        createCreatesRemote: false,
        apiFailureAtCall: 2,
        apiFailureMode: "status",
      },
      {
        createExitCode: 1,
        createdApplications: [validApplication(), secondApplication],
      },
    ];
    for (const fixture of fixtures) {
      const home = await createTemporaryHome();
      await writeProtectedContext(home);
      const { dependencies, errors } = createDependencies(home, fixture);

      expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
      expect(errors.join("\n")).toContain("REMOTE_APP_CONFLICT");
    }
  });

  test("rolls back when final binding promotion fails", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, {
      blockFinalBindingWrite: true,
    });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("FILE_IO_ERROR");
    expect(calls.some((call) => call.arguments.includes("delete"))).toBe(true);
  });

  test("fails closed when the promoted candidate cannot be removed", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, errors } = createDependencies(home, { candidateUnlinkFails: true });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("FILE_IO_ERROR");
  });

  test("does not confuse unrelated personal applications with the staging target", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const unrelatedApplication = {
      ...validApplication(),
      app_id: "app_unrelated_fixture",
      name: "unrelated-personal-application",
      deploy_url: "https://push.par.clever-cloud.com/app_unrelated_fixture.git",
      git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_unrelated_fixture.git",
    };
    const { dependencies, calls } = createDependencies(home, {
      applications: [unrelatedApplication],
    });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(0);
    expect(calls.some((call) => call.arguments.includes("create"))).toBe(true);
  });

  test("deletes the just-created application when its local binding is invalid", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, {
      candidateBinding: { apps: [] },
    });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("UNSAFE_BINDING");
    expect(
      calls.some(
        (call) =>
          call.command === "clever" &&
          call.arguments.join(" ") === "--no-update-notifier delete --alias website-staging --yes",
      ),
    ).toBe(true);
  });

  test("refuses arbitrary Clever flags and operations", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home);

    expect(await runPersonalClever(["status", "--app", "app_other"], dependencies)).toBe(2);
    expect(await runPersonalClever(["delete"], dependencies)).toBe(2);
    expect(await runPersonalClever(["logs"], dependencies)).toBe(2);
    expect(calls).toEqual([]);
    expect(errors.join("\n")).toContain("UNSUPPORTED_OPERATION");
  });

  test("refuses staging creation from a dirty repository before mutation", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home, { dirtyGit: true });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("DIRTY_REPOSITORY");
    expect(calls.some((call) => call.arguments.includes("create"))).toBe(false);
  });

  test("refuses creation from a non-main, unfetchable, or outdated repository", async () => {
    const fixtures: Partial<FakeState>[] = [
      { gitBranch: "feature" },
      { failingCaptured: "git fetch --quiet origin main" },
      { remoteHeadCommit: "c".repeat(40) },
    ];
    for (const fixture of fixtures) {
      const home = await createTemporaryHome();
      await writeProtectedContext(home);
      const { dependencies, calls, errors } = createDependencies(home, fixture);

      expect(await runPersonalClever(["create-staging"], dependencies)).toBe(1);
      expect(errors.length).toBeGreaterThan(0);
      expect(calls.some((call) => call.arguments.includes("create"))).toBe(false);
    }
  });

  test("refuses deployment from a dirty repository before invoking Clever", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const application = validApplication();
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [application],
      dirtyGit: true,
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("DIRTY_REPOSITORY");
    expect(
      calls.some((call) => call.command === "clever" && call.arguments.includes("deploy")),
    ).toBe(false);
  });

  test("refuses deployment when the private clone cannot be created", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [validApplication()],
      failClone: true,
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    expect(calls.some((call) => call.arguments.includes("stop"))).toBe(false);
  });

  test("catches unexpected subprocess failures without leaking details", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, errors } = createDependencies(home, {
      throwCaptured: "clever --no-update-notifier --version",
    });

    expect(await runPersonalClever(["doctor"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("FILE_IO_ERROR");
  });

  test("refuses bound operations when no staging binding exists", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home);

    expect(await runPersonalClever(["status"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("MISSING_CONTEXT");
    expect(calls.some((call) => call.arguments.includes("status"))).toBe(false);
  });

  test("runs both quality gates before the fixed staging deployment", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, fetchedUrls } = createDependencies(home, {
      applications: [validApplication()],
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(0);
    const interactiveCalls = calls.filter((call) => call.kind === "interactive");
    expect(interactiveCalls.map((call) => [call.command, ...call.arguments])).toEqual([
      ["bun", "run", "check"],
      ["bun", "run", "test:e2e"],
    ]);
    expect(
      calls.some(
        (call) =>
          call.kind === "captured" &&
          call.command === "clever" &&
          call.arguments.includes("deploy"),
      ),
    ).toBe(true);
    const cloneCall = calls.find((call) => call.command === "git" && call.arguments[0] === "clone");
    expect(cloneCall?.arguments ?? []).toContain("--no-hardlinks");
    expect(cloneCall?.arguments ?? []).toContain("--single-branch");
    const deployCall = calls.find(
      (call) => call.command === "clever" && call.arguments.includes("deploy"),
    );
    expect(
      calls
        .filter((call) => call.command === "clever")
        .every((call) => !call.arguments.includes("--app") && !call.arguments.includes("--org")),
    ).toBe(true);
    expect(deployCall?.options.cwd).not.toBe("/repo");
    expect(deployCall?.arguments ?? []).toContain("rebuild");
    const deploymentDirectory = deployCall?.options.cwd;
    if (deploymentDirectory === undefined) throw new Error("deployment call missing");
    await expect(stat(dirname(deploymentDirectory))).rejects.toThrow();
    expect(
      calls.some(
        (call) =>
          call.kind === "captured" &&
          call.command === "git" &&
          call.arguments.join(" ") === "fetch --quiet origin main",
      ),
    ).toBe(true);
    expect(
      interactiveCalls
        .filter((call) => call.command === "bun")
        .every(
          (call) =>
            call.options.environment?.CONFIGURATION_FILE === undefined &&
            call.options.environment?.APP_CONFIGURATION_FILE === undefined &&
            call.options.environment?.GIT_SSH_COMMAND === undefined,
        ),
    ).toBe(true);
    expect(fetchedUrls).toEqual([
      "https://app-staging-fixture.cleverapps.io/",
      "https://app-staging-fixture.cleverapps.io/comparaisons.html",
      "https://app-staging-fixture.cleverapps.io/marque.html",
    ]);
  });

  test("refuses to smoke an ambiguous or custom-only public domain", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, fetchedUrls, errors } = createDependencies(home, {
      applications: [validApplication()],
      domains: [{ domainWithPathPrefix: "staging.example.test" }],
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("UNSAFE_BINDING");
    expect(fetchedUrls).toEqual([]);
    expect(
      calls.some(
        (call) => call.arguments.join(" ") === "--no-update-notifier stop --alias website-staging",
      ),
    ).toBe(true);
  });

  test("stops staging when a deployment attempt returns an ambiguous failure", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [validApplication()],
      failDeploy: true,
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    expect(errors.join("\n")).not.toContain(personalEmail);
    expect(
      calls.some(
        (call) => call.arguments.join(" ") === "--no-update-notifier stop --alias website-staging",
      ),
    ).toBe(true);
  });

  test("fails closed when automatic stop itself fails", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, errors } = createDependencies(home, {
      applications: [validApplication()],
      smokeFailurePath: "/comparaisons.html",
      failingCaptured: "clever --no-update-notifier stop --alias website-staging",
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("automatic stop could not be verified");
  });

  test("stops before deployment when a quality gate fails", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [validApplication()],
      failingInteractive: "bun run check",
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("QUALITY_GATE_FAILED");
    expect(
      calls.some((call) => call.command === "clever" && call.arguments.includes("deploy")),
    ).toBe(false);
  });

  test("automatically stops staging when the post-deploy smoke fails", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [validApplication()],
      smokeFailurePath: "/comparaisons.html",
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("SMOKE_TEST_FAILED");
    expect(
      calls.some(
        (call) =>
          call.kind === "captured" &&
          call.command === "clever" &&
          call.arguments.join(" ") === "--no-update-notifier stop --alias website-staging",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.arguments.join(" ") ===
          "--no-update-notifier status --alias website-staging --format json",
      ),
    ).toBe(true);
  });

  test("fails closed when the automatic stop cannot be confirmed", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, errors } = createDependencies(home, {
      applications: [validApplication()],
      smokeFailurePath: "/comparaisons.html",
      stoppedStatus: "running",
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("automatic stop could not be verified");
  });

  test("does not accept a stopped status while a deployment remains in progress", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, errors } = createDependencies(home, {
      applications: [validApplication()],
      smokeFailurePath: "/comparaisons.html",
      deploymentInProgress: true,
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("automatic stop could not be verified");
  });

  test("rolls back only to a canonical main commit and verifies the public result", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, fetchedUrls } = createDependencies(home, {
      applications: [validApplication()],
    });
    const commit = "b".repeat(40);

    expect(await runPersonalClever(["rollback-staging", commit], dependencies)).toBe(0);
    expect(
      calls.some(
        (call) =>
          call.command === "git" &&
          call.arguments.join(" ") === `merge-base --is-ancestor ${commit} origin/main`,
      ),
    ).toBe(true);
    expect(
      calls
        .filter((call) => call.kind === "interactive")
        .map((call) => [call.command, ...call.arguments]),
    ).toEqual([
      ["bun", "run", "check"],
      ["bun", "run", "test:e2e"],
    ]);
    expect(
      calls.some(
        (call) =>
          call.command === "clever" &&
          call.arguments.join(" ") ===
            `--no-update-notifier restart --alias website-staging --commit ${commit} --exit-on deploy-end`,
      ),
    ).toBe(true);
    expect(fetchedUrls).toEqual([
      "https://app-staging-fixture.cleverapps.io/",
      "https://app-staging-fixture.cleverapps.io/comparaisons.html",
      "https://app-staging-fixture.cleverapps.io/marque.html",
    ]);
  });

  test("refuses a rollback commit outside canonical main before remote mutation", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [validApplication()],
      rollbackCommitAllowed: false,
    });

    expect(await runPersonalClever(["rollback-staging", "b".repeat(40)], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("ROLLBACK_COMMIT_REJECTED");
    expect(
      calls.some((call) => call.command === "clever" && call.arguments.includes("restart")),
    ).toBe(false);
  });

  test("stops staging when rollback smoke verification fails", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [validApplication()],
      smokeFailurePath: "/marque.html",
    });

    expect(await runPersonalClever(["rollback-staging", "b".repeat(40)], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("SMOKE_TEST_FAILED");
    expect(
      calls.some(
        (call) => call.arguments.join(" ") === "--no-update-notifier stop --alias website-staging",
      ),
    ).toBe(true);
  });

  test("stops staging when rollback restart returns an ambiguous failure", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const commit = "b".repeat(40);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [validApplication()],
      failingCaptured:
        `clever --no-update-notifier restart --alias website-staging --commit ${commit} ` +
        "--exit-on deploy-end",
    });

    expect(await runPersonalClever(["rollback-staging", commit], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
    expect(
      calls.some(
        (call) => call.arguments.join(" ") === "--no-update-notifier stop --alias website-staging",
      ),
    ).toBe(true);
  });

  test("refuses rollback before restart when a quality gate fails", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [validApplication()],
      failingInteractive: "bun run check",
    });

    expect(await runPersonalClever(["rollback-staging", "b".repeat(40)], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("QUALITY_GATE_FAILED");
    expect(
      calls.some((call) => call.command === "clever" && call.arguments.includes("restart")),
    ).toBe(false);
  });

  test("never forwards captured Clever output on a failed operation", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, output, errors } = createDependencies(home, {
      applications: [validApplication()],
      failingCaptured: "clever --no-update-notifier status --alias website-staging",
    });

    expect(await runPersonalClever(["status"], dependencies)).toBe(1);
    expect(output.join("\n")).not.toContain(personalEmail);
    expect(errors.join("\n")).not.toContain(personalEmail);
    expect(errors.join("\n")).not.toContain(personalUserId);
  });
});
