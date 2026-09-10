import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  sshKeys: readonly Record<string, unknown>[];
  gitOrigin: string;
  dirtyGit: boolean;
  loginCreatesCredentials: boolean;
  keygenCreatesKeys: boolean;
  registerSshKeyOnAdd: boolean;
  failingInteractive: string | null;
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
    id: personalUserId,
    email: personalEmail,
    has2FA: true,
    isTokenValid: true,
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
    deploy_url: "https://app-staging-fixture.cleverapps.io",
    git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_staging_fixture.git",
    alias: "website-staging",
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
        alias: application.alias,
      },
    ],
  };
}

async function writeProtectedContext(home: string, withBinding = false): Promise<void> {
  const paths = resolvePersonalPaths(home);
  await mkdir(paths.configDirectory, { recursive: true, mode: 0o700 });
  await mkdir(join(home, ".ssh"), { recursive: true, mode: 0o700 });
  await Bun.write(
    paths.policy,
    JSON.stringify({
      version: 1,
      expectedEmail: personalEmail,
      expectedUserId: personalUserId,
      expectedOwnerId: personalUserId,
    }),
  );
  await Bun.write(paths.credentials, "{}");
  await Bun.write(paths.sshPrivateKey, "private-fixture");
  await Bun.write(paths.sshPublicKey, "ssh-ed25519 public-fixture libre-ai-clever-personal\n");
  if (withBinding) await Bun.write(paths.binding, JSON.stringify(validBinding()));

  await chmod(paths.configDirectory, 0o700);
  await chmod(paths.policy, 0o600);
  await chmod(paths.credentials, 0o600);
  await chmod(paths.sshPrivateKey, 0o600);
  await chmod(paths.sshPublicKey, 0o644);
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
} {
  const calls: RecordedCall[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const state: FakeState = {
    profile: validProfile(),
    applications: [],
    sshKeys: [
      {
        name: "libre-ai-website",
        key: "ssh-ed25519 public-fixture libre-ai-clever-personal",
        fingerprint: "SHA256:fixture",
      },
    ],
    gitOrigin: "https://github.com/libre-ai/website.git",
    dirtyGit: false,
    loginCreatesCredentials: true,
    keygenCreatesKeys: true,
    registerSshKeyOnAdd: true,
    failingInteractive: null,
    ...stateOverrides,
  };
  const paths = resolvePersonalPaths(home);
  async function runCapturedFake(
    command: string,
    arguments_: readonly string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    calls.push({ kind: "captured", command, arguments: arguments_, options });
    if (command === "clever" && arguments_.includes("profile")) {
      return commandResult(`${JSON.stringify(state.profile)}\n`);
    }
    if (command === "clever" && arguments_.includes("ssh-keys")) {
      return commandResult(`${JSON.stringify(state.sshKeys)}\n`);
    }
    if (command === "clever" && arguments_.includes("list")) {
      return commandResult(
        `${JSON.stringify([{ id: personalUserId, name: "Personal space", applications: state.applications }])}\n`,
      );
    }
    if (command === "clever" && arguments_.includes("create")) {
      const candidate = options.environment?.APP_CONFIGURATION_FILE;
      if (candidate === undefined) return commandResult("", 1, "candidate missing");
      await Bun.write(candidate, JSON.stringify(validBinding()));
      await chmod(candidate, 0o600);
      state.applications = [validApplication()];
      return commandResult(`${JSON.stringify(validApplication())}\n`);
    }
    if (command === "git") {
      const gitOperation = arguments_.join(" ");
      if (gitOperation === "rev-parse --show-toplevel") return commandResult("/repo\n");
      if (gitOperation === "remote get-url origin") {
        return commandResult(`${state.gitOrigin}\n`);
      }
      if (gitOperation === "branch --show-current") return commandResult("main\n");
      if (gitOperation === "status --porcelain") {
        return commandResult(state.dirtyGit ? " M tracked-file\n" : "");
      }
      if (gitOperation === "rev-parse HEAD" || gitOperation === "rev-parse origin/main") {
        return commandResult(`${"a".repeat(40)}\n`);
      }
    }
    return commandResult();
  }

  const dependencies: PersonalCleverDependencies = {
    home,
    cwd: "/repo",
    environment,
    runCaptured: runCapturedFake,
    runInteractive: async (command, arguments_, options = {}) => {
      calls.push({ kind: "interactive", command, arguments: arguments_, options });
      if (`${command} ${arguments_.join(" ")}` === state.failingInteractive) return 1;
      if (command === "clever" && arguments_.includes("login") && state.loginCreatesCredentials) {
        await Bun.write(paths.credentials, "{}");
        await chmod(paths.credentials, 0o600);
      }
      if (command === "ssh-keygen" && state.keygenCreatesKeys) {
        await Bun.write(paths.sshPrivateKey, "private-fixture");
        await Bun.write(
          paths.sshPublicKey,
          "ssh-ed25519 public-fixture libre-ai-clever-personal\n",
        );
        await chmod(paths.sshPrivateKey, 0o600);
        await chmod(paths.sshPublicKey, 0o644);
      }
      if (command === "clever" && arguments_.includes("add") && state.registerSshKeyOnAdd) {
        state.sshKeys = [
          {
            name: "libre-ai-website",
            key: (await readFile(paths.sshPublicKey, "utf8")).trim(),
            fingerprint: "SHA256:fixture",
          },
        ];
      }
      return 0;
    },
    writeOutput: (message) => output.push(message),
    writeError: (message) => errors.push(message),
  };
  return { dependencies, calls, output, errors, state };
}

describe("personal Clever doctor", () => {
  test("passes only the isolated exact account and redacts all identity values", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, output, errors } = createDependencies(home);

    expect(await runPersonalClever(["doctor"], dependencies)).toBe(0);
    expect(errors).toEqual([]);
    expect(output.join("\n")).toContain("PASS");
    expect(output.join("\n")).not.toContain(personalEmail);
    expect(output.join("\n")).not.toContain(personalUserId);
    expect(
      calls.every((call) => call.options.environment?.CONFIGURATION_FILE?.startsWith(home)),
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
});

describe("personal Clever enrollment", () => {
  test("enrolls the exact isolated identity and a dedicated SSH key", async () => {
    const home = await createTemporaryHome();
    const { dependencies, calls, errors } = createDependencies(
      home,
      { sshKeys: [] },
      { LIBRE_AI_CLEVER_EXPECTED_EMAIL: personalEmail },
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
    expect((await stat(paths.sshPrivateKey)).mode & 0o777).toBe(0o600);
    expect((await stat(paths.sshPublicKey)).mode & 0o777).toBe(0o644);
    expect(
      calls.some((call) => call.command === "clever" && call.arguments.includes("login")),
    ).toBe(true);
    expect(calls.some((call) => call.command === "ssh-keygen")).toBe(true);
    expect(calls.some((call) => call.command === "clever" && call.arguments.includes("add"))).toBe(
      true,
    );
    expect(
      calls.every((call) => call.options.environment?.LIBRE_AI_CLEVER_EXPECTED_EMAIL === undefined),
    ).toBe(true);
  });

  test("refuses success when login does not create isolated credentials", async () => {
    const home = await createTemporaryHome();
    const { dependencies, errors } = createDependencies(
      home,
      { loginCreatesCredentials: false, sshKeys: [] },
      { LIBRE_AI_CLEVER_EXPECTED_EMAIL: personalEmail },
    );

    expect(await runPersonalClever(["login"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("COMMAND_ERROR");
  });

  test("requires remote confirmation after registering the dedicated SSH key", async () => {
    const home = await createTemporaryHome();
    const { dependencies, errors } = createDependencies(
      home,
      { registerSshKeyOnAdd: false, sshKeys: [] },
      { LIBRE_AI_CLEVER_EXPECTED_EMAIL: personalEmail },
    );

    expect(await runPersonalClever(["login"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("SSH_KEY_MISMATCH");
  });
});

describe("personal Clever staging operations", () => {
  test("creates only the fixed personal static Paris staging binding", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls } = createDependencies(home);
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
      "--org",
      personalUserId,
      "--alias",
      "website-staging",
      "--format",
      "json",
    ]);
    expect(createCall?.options.environment?.APP_CONFIGURATION_FILE).toBe(paths.bindingCandidate);
  });

  test("does not confuse unrelated personal applications with the staging target", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const unrelatedApplication = {
      ...validApplication(),
      app_id: "app_unrelated_fixture",
      name: "unrelated-personal-application",
      deploy_url: "https://app-unrelated-fixture.cleverapps.io",
      git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_unrelated_fixture.git",
      alias: "",
    };
    const { dependencies, calls } = createDependencies(home, {
      applications: [unrelatedApplication],
    });

    expect(await runPersonalClever(["create-staging"], dependencies)).toBe(0);
    expect(calls.some((call) => call.arguments.includes("create"))).toBe(true);
  });

  test("refuses arbitrary Clever flags and operations", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home);
    const { dependencies, calls, errors } = createDependencies(home);

    expect(await runPersonalClever(["status", "--app", "app_other"], dependencies)).toBe(2);
    expect(await runPersonalClever(["delete"], dependencies)).toBe(2);
    expect(calls).toEqual([]);
    expect(errors.join("\n")).toContain("UNSUPPORTED_OPERATION");
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

  test("runs both quality gates before the fixed staging deployment", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls } = createDependencies(home, {
      applications: [{ ...validApplication(), alias: "" }],
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(0);
    const interactiveCalls = calls.filter((call) => call.kind === "interactive");
    expect(interactiveCalls.map((call) => [call.command, ...call.arguments])).toEqual([
      ["bun", "run", "check"],
      ["bun", "run", "test:e2e"],
      [
        "clever",
        "--no-update-notifier",
        "deploy",
        "--alias",
        "website-staging",
        "--branch",
        "main",
        "--follow",
        "--exit-on",
        "deploy-end",
      ],
    ]);
  });

  test("stops before deployment when a quality gate fails", async () => {
    const home = await createTemporaryHome();
    await writeProtectedContext(home, true);
    const { dependencies, calls, errors } = createDependencies(home, {
      applications: [{ ...validApplication(), alias: "" }],
      failingInteractive: "bun run check",
    });

    expect(await runPersonalClever(["deploy-staging"], dependencies)).toBe(1);
    expect(errors.join("\n")).toContain("QUALITY_GATE_FAILED");
    expect(
      calls.some((call) => call.command === "clever" && call.arguments.includes("deploy")),
    ).toBe(false);
  });
});
