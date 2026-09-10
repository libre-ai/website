import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildIsolatedEnvironment,
  checkProtectedMode,
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
      credentials: "/test-home/.config/libre-ai/clever/clever-tools.json",
      policy: "/test-home/.config/libre-ai/clever/context.json",
      binding: "/test-home/.config/libre-ai/clever/website-staging.json",
      bindingCandidate: "/test-home/.config/libre-ai/clever/website-staging.candidate.json",
      sshPrivateKey: "/test-home/.ssh/libre_ai_clever_personal_ed25519",
      sshPublicKey: "/test-home/.ssh/libre_ai_clever_personal_ed25519.pub",
    });
  });

  test("scrubs every inherited context override and forces the dedicated files and key", () => {
    const paths = resolvePersonalPaths("/test home");
    const environment = buildIsolatedEnvironment({
      source: {
        PATH: "/bin",
        CLEVER_TOKEN: "wrong-token",
        CLEVER_SECRET: "wrong-secret",
        CONFIGURATION_FILE: "/wrong/config",
        APP_CONFIGURATION_FILE: "/wrong/app",
        API_HOST: "https://wrong.example.test",
        AUTH_BRIDGE_HOST: "https://wrong.example.test",
        CONSOLE_URL: "https://wrong.example.test",
        OAUTH_CONSUMER_KEY: "wrong-key",
        OAUTH_CONSUMER_SECRET: "wrong-secret",
        SSH_GATEWAY: "wrong-gateway",
        GIT_SSH: "/wrong/ssh",
        GIT_SSH_COMMAND: "ssh -i /wrong/key",
      },
      paths,
    });

    expect(environment.PATH).toBe("/bin");
    expect(environment.CLEVER_TOKEN).toBeUndefined();
    expect(environment.CLEVER_SECRET).toBeUndefined();
    expect(environment.API_HOST).toBeUndefined();
    expect(environment.CONFIGURATION_FILE).toBe(paths.credentials);
    expect(environment.APP_CONFIGURATION_FILE).toBe(paths.binding);
    expect(environment.GIT_SSH_COMMAND).toBe(
      "ssh -i '/test home/.ssh/libre_ai_clever_personal_ed25519' -o IdentitiesOnly=yes",
    );
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
