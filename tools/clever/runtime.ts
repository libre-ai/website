import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

import type { ContextError, Result } from "./context";

export interface PersonalPaths {
  configDirectory: string;
  runtimeHome: string;
  xdgConfigHome: string;
  xdgCacheHome: string;
  xdgDataHome: string;
  credentials: string;
  experimentalFeatures: string;
  policy: string;
  binding: string;
  bindingCandidate: string;
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
  "EXPERIMENTAL_FEATURES_FILE",
  "APP_CONFIGURATION_FILE",
  "API_HOST",
  "AUTH_BRIDGE_HOST",
  "CONSOLE_URL",
  "CONSOLE_TOKEN_URL",
  "GOTO_URL",
  "API_DOC_URL",
  "DOC_URL",
  "OAUTH_CONSUMER_KEY",
  "OAUTH_CONSUMER_SECRET",
  "SSH_GATEWAY",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_INDEX_FILE",
  "GIT_CEILING_DIRECTORIES",
  "GIT_EXEC_PATH",
  "GIT_PROXY_COMMAND",
  "GIT_ASKPASS",
  "GIT_TERMINAL_PROMPT",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "SSH_AUTH_SOCK",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "BUN_OPTIONS",
  "DYLD_INSERT_LIBRARIES",
  "LD_PRELOAD",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "LIBRE_AI_CLEVER_EXPECTED_EMAIL",
] as const;

function isBlockedEnvironmentName(name: string): boolean {
  return (
    blockedEnvironmentNames.some((blockedName) => blockedName === name) ||
    name.startsWith("GIT_CONFIG_KEY_") ||
    name.startsWith("GIT_CONFIG_VALUE_") ||
    name === "GIT_CONFIG_COUNT"
  );
}

export function hasUnsafeContextOverride(
  source: Readonly<Record<string, string | undefined>>,
  allowedNames: ReadonlySet<string> = new Set(),
): boolean {
  return Object.entries(source).some(
    ([name, value]) =>
      value !== undefined && !allowedNames.has(name) && isBlockedEnvironmentName(name),
  );
}

const defaultMaximumOutputBytes = 64 * 1024;

function runtimeFailure<T>(
  code: ContextError["code"],
  safeMessage: string,
): Result<T, ContextError> {
  return { ok: false, error: { code, safeMessage } };
}

export function resolvePersonalPaths(home = homedir()): PersonalPaths {
  const configDirectory = join(home, ".config", "libre-ai", "clever");
  return {
    configDirectory,
    runtimeHome: join(configDirectory, "home"),
    xdgConfigHome: join(configDirectory, "xdg-config"),
    xdgCacheHome: join(configDirectory, "xdg-cache"),
    xdgDataHome: join(configDirectory, "xdg-data"),
    credentials: join(configDirectory, "clever-tools.json"),
    experimentalFeatures: join(configDirectory, "clever-tools-experimental-features.json"),
    policy: join(configDirectory, "context.json"),
    binding: join(configDirectory, "website-staging.json"),
    bindingCandidate: join(configDirectory, "website-staging.candidate.json"),
  };
}

export function buildSanitizedEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined) environment[name] = value;
  }
  for (const name of Object.keys(environment)) {
    if (isBlockedEnvironmentName(name)) delete environment[name];
  }
  return environment;
}

export function buildIsolatedEnvironment(input: RuntimeEnvironmentInput): Record<string, string> {
  const environment = buildSanitizedEnvironment(input.source);
  delete environment.HOME;
  delete environment.XDG_CONFIG_HOME;
  delete environment.XDG_CACHE_HOME;
  delete environment.XDG_DATA_HOME;
  delete environment.APPDATA;
  environment.HOME = input.paths.runtimeHome;
  environment.XDG_CONFIG_HOME = input.paths.xdgConfigHome;
  environment.XDG_CACHE_HOME = input.paths.xdgCacheHome;
  environment.XDG_DATA_HOME = input.paths.xdgDataHome;
  environment.APPDATA = input.paths.xdgConfigHome;
  environment.PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
  environment.GIT_CONFIG_GLOBAL = "/dev/null";
  environment.GIT_CONFIG_SYSTEM = "/dev/null";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.CONFIGURATION_FILE = input.paths.credentials;
  environment.EXPERIMENTAL_FEATURES_FILE = input.paths.experimentalFeatures;
  environment.APP_CONFIGURATION_FILE = input.applicationConfigurationFile ?? input.paths.binding;
  return environment;
}

export async function checkProtectedMode(
  path: string,
  kind: ProtectedPathKind,
): Promise<Result<void, ContextError>> {
  try {
    const details = await lstat(path);
    const permissions = details.mode & 0o777;
    const isExpectedType = kind === "directory" ? details.isDirectory() : details.isFile();
    const currentUserId = process.getuid?.();
    const isOwnedByCurrentUser = currentUserId === undefined || details.uid === currentUserId;
    const modeIsSafe =
      kind === "directory"
        ? permissions === 0o700
        : kind === "public-key"
          ? (permissions & 0o133) === 0 && (permissions & 0o022) === 0
          : permissions === 0o600;

    if (!isExpectedType || !isOwnedByCurrentUser || !modeIsSafe) {
      return runtimeFailure("UNSAFE_FILE_MODE", "A personal Clever path has unsafe permissions.");
    }
    return { ok: true, value: undefined };
  } catch {
    return runtimeFailure("FILE_IO_ERROR", "A required personal Clever path is unavailable.");
  }
}

export async function checkCanonicalPathWithinHome(
  path: string,
  home: string,
): Promise<Result<void, ContextError>> {
  try {
    const lexicalRelativePath = relative(resolve(home), resolve(path));
    if (lexicalRelativePath === "" || lexicalRelativePath.startsWith("..")) {
      return runtimeFailure("UNSAFE_FILE_MODE", "A personal Clever path escapes its home.");
    }
    const canonicalHome = await realpath(home);
    const canonicalPath = await realpath(path);
    if (canonicalPath !== resolve(canonicalHome, lexicalRelativePath)) {
      return runtimeFailure("UNSAFE_FILE_MODE", "A personal Clever path uses a symbolic link.");
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
