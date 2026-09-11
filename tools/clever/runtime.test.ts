import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildIsolatedEnvironment,
  checkCanonicalPathWithinHome,
  checkProtectedMode,
  hasUnsafeContextOverride,
  readJsonFile,
  resolvePersonalPaths,
  runCaptured,
  runInteractive,
  writeJsonAtomically,
} from "./runtime";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "libre-ai-clever-runtime-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

describe("personal Clever runtime paths", () => {
  test("derives every sensitive path outside the repository from one home", () => {
    const paths = resolvePersonalPaths("/test-home");

    expect(paths).toEqual({
      configDirectory: "/test-home/.config/libre-ai/clever",
      runtimeHome: "/test-home/.config/libre-ai/clever/home",
      xdgConfigHome: "/test-home/.config/libre-ai/clever/xdg-config",
      xdgCacheHome: "/test-home/.config/libre-ai/clever/xdg-cache",
      xdgDataHome: "/test-home/.config/libre-ai/clever/xdg-data",
      credentials: "/test-home/.config/libre-ai/clever/clever-tools.json",
      experimentalFeatures:
        "/test-home/.config/libre-ai/clever/clever-tools-experimental-features.json",
      policy: "/test-home/.config/libre-ai/clever/context.json",
      binding: "/test-home/.config/libre-ai/clever/website-staging.json",
      bindingCandidate: "/test-home/.config/libre-ai/clever/website-staging.candidate.json",
    });
  });

  test("scrubs every inherited context override and forces dedicated state roots", () => {
    const paths = resolvePersonalPaths("/test home");
    const environment = buildIsolatedEnvironment({
      source: {
        PATH: "/bin",
        CLEVER_TOKEN: "wrong-token",
        CLEVER_SECRET: "wrong-secret",
        CONFIGURATION_FILE: "/wrong/config",
        EXPERIMENTAL_FEATURES_FILE: "/wrong/features",
        APP_CONFIGURATION_FILE: "/wrong/app",
        API_HOST: "https://wrong.example.test",
        AUTH_BRIDGE_HOST: "https://wrong.example.test",
        CONSOLE_URL: "https://wrong.example.test",
        CONSOLE_TOKEN_URL: "https://wrong.example.test",
        GOTO_URL: "https://wrong.example.test",
        OAUTH_CONSUMER_KEY: "wrong-key",
        OAUTH_CONSUMER_SECRET: "wrong-secret",
        SSH_GATEWAY: "wrong-gateway",
        GIT_SSH: "/wrong/ssh",
        GIT_SSH_COMMAND: "ssh -i /wrong/key",
        GIT_DIR: "/wrong/repository",
        GIT_WORK_TREE: "/wrong/worktree",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "remote.origin.url",
        GIT_CONFIG_VALUE_0: "https://github.com/example/other.git",
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        HOME: "/real-home",
        XDG_CONFIG_HOME: "/work-config",
        XDG_CACHE_HOME: "/work-cache",
        XDG_DATA_HOME: "/work-data",
        APPDATA: "/work-appdata",
      },
      paths,
    });

    expect(environment.PATH).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
    expect(environment.HOME).toBe(paths.runtimeHome);
    expect(environment.XDG_CONFIG_HOME).toBe(paths.xdgConfigHome);
    expect(environment.XDG_CACHE_HOME).toBe(paths.xdgCacheHome);
    expect(environment.XDG_DATA_HOME).toBe(paths.xdgDataHome);
    expect(environment.APPDATA).toBe(paths.xdgConfigHome);
    expect(environment.CLEVER_TOKEN).toBeUndefined();
    expect(environment.CLEVER_SECRET).toBeUndefined();
    expect(environment.API_HOST).toBeUndefined();
    expect(environment.CONSOLE_TOKEN_URL).toBeUndefined();
    expect(environment.GOTO_URL).toBeUndefined();
    expect(environment.GIT_DIR).toBeUndefined();
    expect(environment.GIT_WORK_TREE).toBeUndefined();
    expect(environment.GIT_CONFIG_COUNT).toBeUndefined();
    expect(environment.GIT_CONFIG_KEY_0).toBeUndefined();
    expect(environment.GIT_CONFIG_VALUE_0).toBeUndefined();
    expect(environment.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    expect(environment.GIT_CONFIG_GLOBAL).toBe("/dev/null");
    expect(environment.GIT_CONFIG_SYSTEM).toBe("/dev/null");
    expect(environment.GIT_CONFIG_NOSYSTEM).toBe("1");
    expect(environment.GIT_TERMINAL_PROMPT).toBe("0");
    expect(environment.CONFIGURATION_FILE).toBe(paths.credentials);
    expect(environment.EXPERIMENTAL_FEATURES_FILE).toBe(paths.experimentalFeatures);
    expect(environment.APP_CONFIGURATION_FILE).toBe(paths.binding);
    expect(environment.GIT_SSH_COMMAND).toBeUndefined();
  });

  test("detects static and indexed context overrides with one explicit enrollment exception", () => {
    expect(hasUnsafeContextOverride({ CONSOLE_TOKEN_URL: "https://wrong.example.test" })).toBe(
      true,
    );
    expect(hasUnsafeContextOverride({ GIT_CONFIG_KEY_0: "remote.origin.url" })).toBe(true);
    expect(hasUnsafeContextOverride({ NODE_TLS_REJECT_UNAUTHORIZED: "0" })).toBe(true);
    expect(
      hasUnsafeContextOverride(
        { LIBRE_AI_CLEVER_EXPECTED_EMAIL: "owner@example.test" },
        new Set(["LIBRE_AI_CLEVER_EXPECTED_EMAIL"]),
      ),
    ).toBe(false);
  });
});

describe("protected personal Clever files", () => {
  test("accepts exact protected modes and rejects permissive modes", async () => {
    const root = await createTemporaryDirectory();
    const directory = join(root, "protected");
    const secret = join(directory, "secret.json");
    await mkdir(directory, { mode: 0o700 });
    await Bun.write(secret, "{}", { mode: 0o600 });
    await chmod(directory, 0o700);
    await chmod(secret, 0o600);

    expect((await checkProtectedMode(directory, "directory")).ok).toBe(true);
    expect((await checkProtectedMode(secret, "secret")).ok).toBe(true);

    await chmod(directory, 0o755);
    await chmod(secret, 0o644);
    const directoryResult = await checkProtectedMode(directory, "directory");
    const secretResult = await checkProtectedMode(secret, "secret");
    expect(directoryResult.ok).toBe(false);
    expect(secretResult.ok).toBe(false);
    if (!directoryResult.ok) expect(directoryResult.error.code).toBe("UNSAFE_FILE_MODE");
    if (!secretResult.ok) expect(secretResult.error.code).toBe("UNSAFE_FILE_MODE");
  });

  test("rejects symbolic links even when their targets have protected modes", async () => {
    const root = await createTemporaryDirectory();
    const target = join(root, "target.json");
    const linked = join(root, "linked.json");
    await Bun.write(target, "{}");
    await chmod(target, 0o600);
    await symlink(target, linked);

    const result = await checkProtectedMode(linked, "secret");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSAFE_FILE_MODE");
  });

  test("rejects symbolic links in parent path components", async () => {
    const root = await createTemporaryDirectory();
    const target = join(root, "target");
    const linkedParent = join(root, "linked-parent");
    await mkdir(target);
    await symlink(target, linkedParent);
    const child = join(linkedParent, "secret.json");
    await Bun.write(child, "{}", { mode: 0o600 });

    const result = await checkCanonicalPathWithinHome(child, root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSAFE_FILE_MODE");
  });

  test("writes JSON atomically with the requested mode and preserves prior state on failure", async () => {
    const root = await createTemporaryDirectory();
    const target = join(root, "context.json");

    expect((await writeJsonAtomically(target, { version: 1 }, 0o600)).ok).toBe(true);
    expect(await readFile(target, "utf8")).toBe('{\n  "version": 1\n}\n');
    expect((await stat(target)).mode & 0o777).toBe(0o600);

    const failed = await writeJsonAtomically(join(target, "child.json"), { version: 2 }, 0o600);
    expect(failed.ok).toBe(false);
    expect(await readFile(target, "utf8")).toBe('{\n  "version": 1\n}\n');
  });

  test("returns a safe error for malformed JSON", async () => {
    const root = await createTemporaryDirectory();
    const target = join(root, "context.json");
    await Bun.write(target, "not-json", { mode: 0o600 });

    const result = await readJsonFile(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MALFORMED_JSON_FILE");
      expect(result.error.safeMessage).not.toContain(target);
      expect(result.error.safeMessage).not.toContain("not-json");
    }
  });
});

describe("bounded subprocess capture", () => {
  test("preserves exit status and captures ordinary output", async () => {
    const result = await runCaptured(process.execPath, [
      "-e",
      'console.log("safe-out"); console.error("safe-error"); process.exit(7);',
    ]);

    expect(result.exitCode).toBe(7);
    expect(result.stdout).toBe("safe-out\n");
    expect(result.stderr).toBe("safe-error\n");
    expect(result.stdoutTruncated).toBe(false);
    expect(result.stderrTruncated).toBe(false);
  });

  test("caps both streams without deadlocking the child", async () => {
    const result = await runCaptured(
      process.execPath,
      ["-e", 'process.stdout.write("o".repeat(70000)); process.stderr.write("e".repeat(70000));'],
      { maxOutputBytes: 1024 },
    );

    expect(Buffer.byteLength(result.stdout)).toBe(1024);
    expect(Buffer.byteLength(result.stderr)).toBe(1024);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test("preserves the exit status of an interactive subprocess", async () => {
    const exitCode = await runInteractive(process.execPath, ["-e", "process.exit(6)"]);

    expect(exitCode).toBe(6);
  });
});
