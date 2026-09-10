import { describe, expect, test } from "bun:test";

import {
  parseBinding,
  parsePolicy,
  parseProfile,
  parseRemoteApplications,
  redactContextError,
  validateIdentity,
  validateOptionalBinding,
  validateRemoteApplication,
} from "./context";

const validProfile = {
  id: "user_personal_fixture",
  email: "owner@personal.example.test",
  has2FA: true,
  isTokenValid: true,
};

const validPolicy = {
  version: 1,
  expectedEmail: "owner@personal.example.test",
  expectedUserId: "user_personal_fixture",
  expectedOwnerId: "user_personal_fixture",
};

const validBinding = {
  apps: [
    {
      app_id: "app_staging_fixture",
      org_id: "user_personal_fixture",
      deploy_url: "https://app-staging-fixture.cleverapps.io",
      git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_staging_fixture.git",
      name: "libre-ai-website-staging",
      alias: "website-staging",
    },
  ],
};

const validRemoteApplications = [
  {
    id: "user_personal_fixture",
    name: "Personal space",
    applications: [
      {
        app_id: "app_staging_fixture",
        org_id: "user_personal_fixture",
        name: "libre-ai-website-staging",
        zone: "par",
        type: "static",
        createdAt: "2026-09-10T12:00:00.000Z",
        deploy_url: "https://app-staging-fixture.cleverapps.io",
        git_ssh_url: "git+ssh://git@push.par.clever-cloud.com/app_staging_fixture.git",
        alias: "",
      },
    ],
  },
];

function expectErrorCode(result: { ok: boolean; error?: { code: string } }, code: string): void {
  expect(result.ok).toBe(false);
  expect(result.error?.code).toBe(code);
}

describe("personal Clever identity policy", () => {
  test("accepts only the exact enrolled identity with 2FA and a personal owner", () => {
    const profile = parseProfile(validProfile);
    const policy = parsePolicy(validPolicy);
    expect(profile.ok).toBe(true);
    expect(policy.ok).toBe(true);
    if (!profile.ok || !policy.ok) return;

    expect(validateIdentity(profile.value, policy.value)).toEqual({
      ok: true,
      value: {
        userId: "user_personal_fixture",
        ownerId: "user_personal_fixture",
      },
    });
  });

  test("rejects a different email without disclosing either identity", () => {
    const profile = parseProfile({ ...validProfile, email: "wrong@work.example.test" });
    const policy = parsePolicy(validPolicy);
    if (!profile.ok || !policy.ok) throw new Error("fixture parsing failed");

    const result = validateIdentity(profile.value, policy.value);
    expectErrorCode(result, "IDENTITY_MISMATCH");
    if (result.ok) return;

    const message = redactContextError(result.error);
    expect(message).not.toContain("wrong@work.example.test");
    expect(message).not.toContain("owner@personal.example.test");
  });

  test("rejects an invalid token before identity enrollment", () => {
    const profile = parseProfile({ ...validProfile, isTokenValid: false });
    const policy = parsePolicy({ ...validPolicy, expectedUserId: null, expectedOwnerId: null });
    if (!profile.ok || !policy.ok) throw new Error("fixture parsing failed");

    expectErrorCode(validateIdentity(profile.value, policy.value), "INVALID_TOKEN");
  });

  test("rejects disabled 2FA before identity enrollment", () => {
    const profile = parseProfile({ ...validProfile, has2FA: false });
    const policy = parsePolicy({ ...validPolicy, expectedUserId: null, expectedOwnerId: null });
    if (!profile.ok || !policy.ok) throw new Error("fixture parsing failed");

    expectErrorCode(validateIdentity(profile.value, policy.value), "TWO_FACTOR_REQUIRED");
  });

  test("rejects an enrolled user or owner that differs from the active user", () => {
    const profile = parseProfile(validProfile);
    if (!profile.ok) throw new Error("fixture parsing failed");

    const wrongUser = parsePolicy({ ...validPolicy, expectedUserId: "user_other_fixture" });
    const organizationOwner = parsePolicy({ ...validPolicy, expectedOwnerId: "orga_fixture" });
    if (!wrongUser.ok || !organizationOwner.ok) throw new Error("fixture parsing failed");

    expectErrorCode(validateIdentity(profile.value, wrongUser.value), "IDENTITY_MISMATCH");
    expectErrorCode(validateIdentity(profile.value, organizationOwner.value), "OWNER_NOT_PERSONAL");
  });

  test("rejects malformed profile and policy values", () => {
    expectErrorCode(parseProfile({ ...validProfile, has2FA: "yes" }), "MALFORMED_PROFILE");
    expectErrorCode(parsePolicy({ ...validPolicy, version: 2 }), "MALFORMED_POLICY");
    expectErrorCode(
      parsePolicy({ ...validPolicy, expectedEmail: "not-an-email" }),
      "MALFORMED_POLICY",
    );
  });
});

describe("personal Clever application policy", () => {
  test("accepts no binding before staging creation", () => {
    const profile = parseProfile(validProfile);
    const policy = parsePolicy(validPolicy);
    if (!profile.ok || !policy.ok) throw new Error("fixture parsing failed");
    const identity = validateIdentity(profile.value, policy.value);
    if (!identity.ok) throw new Error("fixture validation failed");

    expect(validateOptionalBinding(null, identity.value)).toEqual({ ok: true, value: null });
  });

  test("accepts one exact personal staging binding", () => {
    const profile = parseProfile(validProfile);
    const policy = parsePolicy(validPolicy);
    const binding = parseBinding(validBinding);
    if (!profile.ok || !policy.ok || !binding.ok) throw new Error("fixture parsing failed");
    const identity = validateIdentity(profile.value, policy.value);
    if (!identity.ok) throw new Error("fixture validation failed");

    const result = validateOptionalBinding(binding.value, identity.value);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    expect(result.value.alias).toBe("website-staging");
  });

  test("rejects multiple applications, a different owner, and active or remote URLs", () => {
    const profile = parseProfile(validProfile);
    const policy = parsePolicy(validPolicy);
    if (!profile.ok || !policy.ok) throw new Error("fixture parsing failed");
    const identity = validateIdentity(profile.value, policy.value);
    if (!identity.ok) throw new Error("fixture validation failed");

    const multiple = parseBinding({ apps: [...validBinding.apps, validBinding.apps[0]] });
    const wrongOwner = parseBinding({
      apps: [{ ...validBinding.apps[0], org_id: "orga_fixture" }],
    });
    const remoteAsset = parseBinding({
      apps: [{ ...validBinding.apps[0], deploy_url: "javascript:alert(1)" }],
    });
    if (!multiple.ok || !wrongOwner.ok) throw new Error("fixture parsing failed");

    expectErrorCode(validateOptionalBinding(multiple.value, identity.value), "UNSAFE_BINDING");
    expectErrorCode(validateOptionalBinding(wrongOwner.value, identity.value), "WRONG_OWNER");
    expectErrorCode(remoteAsset, "MALFORMED_BINDING");
  });

  test("accepts an unbound remote alias and validates type and Paris zone independently", () => {
    const profile = parseProfile(validProfile);
    const policy = parsePolicy(validPolicy);
    const applications = parseRemoteApplications(validRemoteApplications);
    if (!profile.ok || !policy.ok || !applications.ok) throw new Error("fixture parsing failed");
    const identity = validateIdentity(profile.value, policy.value);
    if (!identity.ok) throw new Error("fixture validation failed");
    const remoteOwner = validRemoteApplications[0];
    const remoteApplication = remoteOwner?.applications[0];
    if (remoteOwner === undefined || remoteApplication === undefined) {
      throw new Error("fixture application is missing");
    }

    expect(validateRemoteApplication(applications.value, identity.value).ok).toBe(true);

    const wrongType = parseRemoteApplications([
      {
        ...remoteOwner,
        applications: [{ ...remoteApplication, type: "node" }],
      },
    ]);
    const wrongZone = parseRemoteApplications([
      {
        ...remoteOwner,
        applications: [{ ...remoteApplication, zone: "mtl" }],
      },
    ]);
    if (!wrongType.ok || !wrongZone.ok) throw new Error("fixture parsing failed");

    expectErrorCode(validateRemoteApplication(wrongType.value, identity.value), "WRONG_APP_TYPE");
    expectErrorCode(validateRemoteApplication(wrongZone.value, identity.value), "WRONG_ZONE");
  });
});
