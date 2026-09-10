import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ContextError, Result } from "./context";

export interface PersonalPaths {
  configDirectory: string;
  credentials: string;
  policy: string;
  binding: string;
  bindingCandidate: string;
  sshPrivateKey: string;
  sshPublicKey: string;
}

export interface RuntimeEnvironmentInput {
  source: Readonly<Record<string, string | undefined>>;
  paths: PersonalPaths;
  applicationConfigurationFile?: string;
}

export type ProtectedPathKind = "directory" | "secret" | "private-key" | "public-key";

export interface CommandOptions {
  cwd?: string;
  environment?: Readonly<Record<string, string>>;
  maxOutputBytes?: number;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

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
  "LIBRE_AI_CLEVER_EXPECTED_EMAIL",
] as const;

const defaultMaximumOutputBytes = 64 * 1024;

function runtimeFailure<T>(
  code: ContextError["code"],
  safeMessage: string,
): Result<T, ContextError> {
  return { ok: false, error: { code, safeMessage } };
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function resolvePersonalPaths(home = homedir()): PersonalPaths {
  const configDirectory = join(home, ".config", "libre-ai", "clever");
  return {
    configDirectory,
    credentials: join(configDirectory, "clever-tools.json"),
    policy: join(configDirectory, "context.json"),
    binding: join(configDirectory, "website-staging.json"),
    bindingCandidate: join(configDirectory, "website-staging.candidate.json"),
    sshPrivateKey: join(home, ".ssh", "libre_ai_clever_personal_ed25519"),
    sshPublicKey: join(home, ".ssh", "libre_ai_clever_personal_ed25519.pub"),
  };
}

export function buildIsolatedEnvironment(input: RuntimeEnvironmentInput): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.source)) {
    if (value !== undefined) environment[name] = value;
  }
  for (const name of blockedEnvironmentNames) delete environment[name];

  environment.CONFIGURATION_FILE = input.paths.credentials;
  environment.APP_CONFIGURATION_FILE = input.applicationConfigurationFile ?? input.paths.binding;
  environment.GIT_SSH_COMMAND = `ssh -i ${quoteShellArgument(input.paths.sshPrivateKey)} -o IdentitiesOnly=yes`;
  return environment;
}

export async function checkProtectedMode(
  path: string,
  kind: ProtectedPathKind,
): Promise<Result<void, ContextError>> {
  try {
    const details = await stat(path);
    const permissions = details.mode & 0o777;
    const isExpectedType = kind === "directory" ? details.isDirectory() : details.isFile();
    const modeIsSafe =
      kind === "directory"
        ? permissions === 0o700
        : kind === "public-key"
          ? (permissions & 0o133) === 0 && (permissions & 0o022) === 0
          : permissions === 0o600;

    if (!isExpectedType || !modeIsSafe) {
      return runtimeFailure("UNSAFE_FILE_MODE", "A personal Clever path has unsafe permissions.");
    }
    return { ok: true, value: undefined };
  } catch {
    return runtimeFailure("FILE_IO_ERROR", "A required personal Clever path is unavailable.");
  }
}

export async function readJsonFile(path: string): Promise<Result<unknown, ContextError>> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    return runtimeFailure("FILE_IO_ERROR", "A personal Clever file could not be read.");
  }

  try {
    return { ok: true, value: JSON.parse(contents) as unknown };
  } catch {
    return runtimeFailure("MALFORMED_JSON_FILE", "A personal Clever JSON file is malformed.");
  }
}

export async function writeJsonAtomically(
  path: string,
  value: unknown,
  mode: number,
): Promise<Result<void, ContextError>> {
  const temporaryPath = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryPath, "wx", mode);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.chmod(mode);
    await handle.close();
    handle = null;
    await rename(temporaryPath, path);
    return { ok: true, value: undefined };
  } catch {
    if (handle !== null) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    return runtimeFailure("FILE_IO_ERROR", "A personal Clever file could not be replaced.");
  }
}

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let capturedBytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (capturedBytes >= maximumBytes) {
      truncated = true;
      continue;
    }

    const remainingBytes = maximumBytes - capturedBytes;
    if (value.byteLength > remainingBytes) truncated = true;
    const captured = value.subarray(0, remainingBytes);
    chunks.push(captured);
    capturedBytes += captured.byteLength;
  }

  const output = new Uint8Array(capturedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(output), truncated };
}

export async function runCaptured(
  command: string,
  arguments_: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const maximumBytes = options.maxOutputBytes ?? defaultMaximumOutputBytes;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new TypeError("maxOutputBytes must be a positive safe integer");
  }

  const subprocess = Bun.spawn([command, ...arguments_], {
    cwd: options.cwd,
    env: options.environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    readBounded(subprocess.stdout, maximumBytes),
    readBounded(subprocess.stderr, maximumBytes),
    subprocess.exited,
  ]);

  return {
    exitCode,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
  };
}

export async function runInteractive(
  command: string,
  arguments_: readonly string[],
  options: Omit<CommandOptions, "maxOutputBytes"> = {},
): Promise<number> {
  const subprocess = Bun.spawn([command, ...arguments_], {
    cwd: options.cwd,
    env: options.environment,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return await subprocess.exited;
}
