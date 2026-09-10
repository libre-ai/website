export type ContextErrorCode =
  | "MALFORMED_PROFILE"
  | "MALFORMED_POLICY"
  | "MALFORMED_BINDING"
  | "MALFORMED_REMOTE_APPLICATIONS"
  | "INVALID_TOKEN"
  | "TWO_FACTOR_REQUIRED"
  | "IDENTITY_MISMATCH"
  | "OWNER_NOT_PERSONAL"
  | "UNSAFE_BINDING"
  | "WRONG_OWNER"
  | "WRONG_APP_TYPE"
  | "WRONG_ZONE"
  | "UNSAFE_FILE_MODE"
  | "FILE_IO_ERROR"
  | "MALFORMED_JSON_FILE"
  | "UNSAFE_ENVIRONMENT"
  | "UNSUPPORTED_OPERATION"
  | "COMMAND_ERROR"
  | "MISSING_CONTEXT"
  | "SSH_KEY_MISMATCH"
  | "REMOTE_APP_CONFLICT"
  | "DIRTY_REPOSITORY"
  | "WRONG_REPOSITORY"
  | "WRONG_BRANCH"
  | "OUTDATED_MAIN"
  | "QUALITY_GATE_FAILED";

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

export interface ValidatedIdentity {
  userId: string;
  ownerId: string;
}

interface CleverBindingApplication {
  app_id: string;
  org_id: string;
  deploy_url: string;
  git_ssh_url: string;
  name: string;
  alias: string;
}

export interface CleverBinding {
  apps: readonly CleverBindingApplication[];
}

export interface ValidatedBinding extends CleverBindingApplication {}

export interface RemoteApplication extends CleverBindingApplication {
  zone: string;
  type: string;
  createdAt: string;
}

const stagingName = "libre-ai-website-staging";
const stagingAlias = "website-staging";

function failure<T>(code: ContextErrorCode, safeMessage: string): Result<T, ContextError> {
  return { ok: false, error: { code, safeMessage } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isEmail(value: unknown): value is string {
  return isNonEmptyString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isSafeDeployUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.hostname.endsWith(".cleverapps.io")
    );
  } catch {
    return false;
  }
}

function isSafeGitUrl(value: unknown, applicationId: string): value is string {
  if (!isNonEmptyString(value)) return false;
  const expectedSuffix = `/${applicationId}.git`;
  return (
    value.startsWith("git+ssh://git@push.par.clever-cloud.com/") && value.endsWith(expectedSuffix)
  );
}

function parseBindingApplication(value: unknown): Result<CleverBindingApplication, ContextError> {
  if (!isRecord(value)) {
    return failure("MALFORMED_BINDING", "The Clever application binding is malformed.");
  }

  const applicationId = value.app_id;
  if (
    !isNonEmptyString(applicationId) ||
    !applicationId.startsWith("app_") ||
    !isNonEmptyString(value.org_id) ||
    !isSafeDeployUrl(value.deploy_url) ||
    !isSafeGitUrl(value.git_ssh_url, applicationId) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.alias)
  ) {
    return failure("MALFORMED_BINDING", "The Clever application binding is malformed.");
  }

  return {
    ok: true,
    value: {
      app_id: applicationId,
      org_id: value.org_id,
      deploy_url: value.deploy_url,
      git_ssh_url: value.git_ssh_url,
      name: value.name,
      alias: value.alias,
    },
  };
}

export function parseProfile(value: unknown): Result<CleverProfile, ContextError> {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isEmail(value.email) ||
    typeof value.has2FA !== "boolean" ||
    typeof value.isTokenValid !== "boolean"
  ) {
    return failure("MALFORMED_PROFILE", "The Clever profile response is malformed.");
  }

  return {
    ok: true,
    value: {
      id: value.id,
      email: value.email,
      has2FA: value.has2FA,
      isTokenValid: value.isTokenValid,
    },
  };
}

export function parsePolicy(value: unknown): Result<PersonalContextPolicy, ContextError> {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isEmail(value.expectedEmail) ||
    !isNullableNonEmptyString(value.expectedUserId) ||
    !isNullableNonEmptyString(value.expectedOwnerId) ||
    (value.expectedUserId === null) !== (value.expectedOwnerId === null)
  ) {
    return failure("MALFORMED_POLICY", "The personal Clever policy is malformed.");
  }

  return {
    ok: true,
    value: {
      version: 1,
      expectedEmail: value.expectedEmail,
      expectedUserId: value.expectedUserId,
      expectedOwnerId: value.expectedOwnerId,
    },
  };
}

export function parseBinding(value: unknown): Result<CleverBinding, ContextError> {
  if (!isRecord(value) || !Array.isArray(value.apps)) {
    return failure("MALFORMED_BINDING", "The Clever application binding is malformed.");
  }

  const applications: CleverBindingApplication[] = [];
  for (const application of value.apps) {
    const parsed = parseBindingApplication(application);
    if (!parsed.ok) return parsed;
    applications.push(parsed.value);
  }

  return { ok: true, value: { apps: applications } };
}

export function parseRemoteApplications(
  value: unknown,
): Result<readonly RemoteApplication[], ContextError> {
  if (!Array.isArray(value)) {
    return failure(
      "MALFORMED_REMOTE_APPLICATIONS",
      "The Clever application inventory is malformed.",
    );
  }

  const applications: RemoteApplication[] = [];
  for (const owner of value) {
    if (!isRecord(owner) || !isNonEmptyString(owner.id) || !Array.isArray(owner.applications)) {
      return failure(
        "MALFORMED_REMOTE_APPLICATIONS",
        "The Clever application inventory is malformed.",
      );
    }

    for (const application of owner.applications) {
      if (
        !isRecord(application) ||
        !isNonEmptyString(application.app_id) ||
        !application.app_id.startsWith("app_") ||
        !isNonEmptyString(application.org_id) ||
        !isSafeDeployUrl(application.deploy_url) ||
        !isSafeGitUrl(application.git_ssh_url, application.app_id) ||
        !isNonEmptyString(application.name) ||
        typeof application.alias !== "string" ||
        !isNonEmptyString(application.zone) ||
        !isNonEmptyString(application.type) ||
        !isIsoDate(application.createdAt) ||
        application.org_id !== owner.id
      ) {
        return failure(
          "MALFORMED_REMOTE_APPLICATIONS",
          "The Clever application inventory is malformed.",
        );
      }

      applications.push({
        app_id: application.app_id,
        org_id: application.org_id,
        deploy_url: application.deploy_url,
        git_ssh_url: application.git_ssh_url,
        name: application.name,
        alias: application.alias,
        zone: application.zone,
        type: application.type,
        createdAt: application.createdAt,
      });
    }
  }

  return { ok: true, value: applications };
}

export function validateIdentity(
  profile: CleverProfile,
  policy: PersonalContextPolicy,
): Result<ValidatedIdentity, ContextError> {
  if (!profile.isTokenValid) {
    return failure("INVALID_TOKEN", "The isolated Clever token is invalid.");
  }
  if (!profile.has2FA) {
    return failure("TWO_FACTOR_REQUIRED", "Two-factor authentication is required.");
  }
  if (profile.email !== policy.expectedEmail) {
    return failure("IDENTITY_MISMATCH", "The active Clever identity is not the enrolled identity.");
  }
  if (policy.expectedUserId !== null && profile.id !== policy.expectedUserId) {
    return failure("IDENTITY_MISMATCH", "The active Clever identity is not the enrolled identity.");
  }

  const ownerId = policy.expectedOwnerId ?? profile.id;
  if (ownerId !== profile.id) {
    return failure("OWNER_NOT_PERSONAL", "The allowed owner is not the personal account.");
  }

  return { ok: true, value: { userId: profile.id, ownerId } };
}

export function validateOptionalBinding(
  binding: CleverBinding | null,
  identity: ValidatedIdentity,
): Result<ValidatedBinding | null, ContextError> {
  if (binding === null) return { ok: true, value: null };
  if (binding.apps.length !== 1) {
    return failure("UNSAFE_BINDING", "The staging binding must contain exactly one application.");
  }

  const application = binding.apps[0];
  if (application === undefined) {
    return failure("UNSAFE_BINDING", "The staging binding must contain exactly one application.");
  }
  if (application.org_id !== identity.ownerId) {
    return failure("WRONG_OWNER", "The staging application is not personally owned.");
  }
  if (application.name !== stagingName || application.alias !== stagingAlias) {
    return failure("UNSAFE_BINDING", "The staging application binding is not allowed.");
  }

  return { ok: true, value: application };
}

export function validateRemoteApplication(
  applications: readonly RemoteApplication[],
  identity: ValidatedIdentity,
): Result<RemoteApplication, ContextError> {
  const matching = applications.filter(
    (application) => application.org_id === identity.ownerId && application.name === stagingName,
  );
  if (matching.length !== 1 || matching[0] === undefined) {
    return failure("UNSAFE_BINDING", "The remote staging application is not uniquely identified.");
  }

  const application = matching[0];
  if (application.type !== "static") {
    return failure("WRONG_APP_TYPE", "The staging application is not static.");
  }
  if (application.zone !== "par") {
    return failure("WRONG_ZONE", "The staging application is not hosted in Paris.");
  }

  return { ok: true, value: application };
}

export function redactContextError(error: ContextError): string {
  return `${error.code}: ${error.safeMessage}`;
}
