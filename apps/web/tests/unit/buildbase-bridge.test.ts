import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Unit-test the auth bridge (buildbase workspace-membership gate) in isolation: mock the database
// layer (no Postgres) and the buildbase server factory (no network), and mock the session-revocation
// lookup used by verifySessionToken.
const { ensureMock, provisionMock, listMock } = vi.hoisted(() => ({
  ensureMock: vi.fn(async () => ({ userId: "user_1", profileId: "profile_1" })),
  provisionMock: vi.fn(async () => ({ provisioned: true })),
  listMock: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@agentcenter/database", () => ({
  ensureUserAndProfileForBuildbase: ensureMock,
  provisionFirstBuildbaseOwner: provisionMock,
  getAdminUserSessionsRevokedAt: vi.fn(async () => null),
  revokeAllAdminUserSessions: vi.fn(async () => undefined),
}));

vi.mock("@/server/tenancy/buildbase", () => ({
  BB_SESSION_COOKIE: "bb-session-id",
  isBuildbaseConfigured: () => true,
  getBuildbase: () => ({ withSession: () => ({ workspace: { list: listMock } }) }),
}));

import { bridgeBuildbaseSession, roleFromBuildbase } from "../../src/server/auth/buildbase-bridge";
import { verifySessionToken } from "../../src/server/admin-auth";

const TENANT_WS = "ws_tenant_abc";

/** Build a buildbase workspace where `userId` has `role` (parallel users[]/roles[] arrays). */
function wsWithMember(id: string, userId: string, role: string) {
  return { _id: id, workspaceId: id, users: [{ _id: userId }], roles: [role] };
}

beforeEach(() => {
  ensureMock.mockClear().mockResolvedValue({ userId: "user_1", profileId: "profile_1" });
  provisionMock.mockClear().mockResolvedValue({ provisioned: true });
  listMock.mockClear().mockResolvedValue([]);
  process.env.SYSTEM_SECRET = "test-system-secret-1234567890";
  delete process.env.TENANT_WORKSPACE_ID;
});

afterEach(() => {
  delete process.env.TENANT_WORKSPACE_ID;
});

describe("bridgeBuildbaseSession — identity", () => {
  it("fails closed (no identity) when the buildbase user id is missing", async () => {
    expect(await bridgeBuildbaseSession({ sessionId: "s", user: { id: "" } })).toEqual({
      status: "denied",
      reason: "no-identity",
    });
    expect(ensureMock).not.toHaveBeenCalled();
  });
});

describe("bridgeBuildbaseSession — hosted (TENANT_WORKSPACE_ID set): membership gate", () => {
  beforeEach(() => {
    process.env.TENANT_WORKSPACE_ID = TENANT_WS;
  });

  it("GRANTS a member: mints mc_session + workspace token with the buildbase role", async () => {
    listMock.mockResolvedValue([wsWithMember(TENANT_WS, "bb_owner", "owner")]);
    const outcome = await bridgeBuildbaseSession({
      sessionId: "valid",
      user: { id: "bb_owner", email: "ada@tenant.com", name: "Ada" },
    });
    expect(outcome.status).toBe("granted");
    if (outcome.status !== "granted") return;
    expect(outcome.role).toBe("owner");
    expect(outcome.workspaceId).toBe(TENANT_WS);
    expect(outcome.workspaceToken).toBeTruthy();
    expect(provisionMock).toHaveBeenCalledOnce(); // owner → provisioned

    const payload = await verifySessionToken(outcome.mcToken);
    expect(payload!.sub).toBe("bb_owner");
    expect(payload!.profileId).toBe("profile_1");
    expect(payload!.username).toBe("ada@tenant.com");
    expect(payload).not.toHaveProperty("role"); // role is in the workspace token, not mc_session
  });

  it("resolves a non-owner member as their reported role and does NOT provision ownership", async () => {
    listMock.mockResolvedValue([wsWithMember(TENANT_WS, "bb_m", "member")]);
    const outcome = await bridgeBuildbaseSession({
      sessionId: "valid",
      user: { id: "bb_m", email: "m@tenant.com" },
    });
    expect(outcome.status).toBe("granted");
    if (outcome.status !== "granted") return;
    expect(outcome.role).toBe("member");
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("DENIES a valid session whose user is NOT a member of the bound workspace (cross-tenant)", async () => {
    // buildbase returns only OTHER workspaces the user belongs to — not this tenant's.
    listMock.mockResolvedValue([wsWithMember("ws_other", "bb_x", "owner")]);
    const outcome = await bridgeBuildbaseSession({
      sessionId: "valid",
      user: { id: "bb_x", email: "x@other.com" },
    });
    expect(outcome).toEqual({ status: "denied", reason: "not-a-member" });
    expect(ensureMock).not.toHaveBeenCalled(); // fail-closed: nothing materialised
  });

  it("DENIES (fail-closed) when buildbase refuses / errors on the membership check", async () => {
    listMock.mockRejectedValue(new Error("401 session invalid"));
    const outcome = await bridgeBuildbaseSession({
      sessionId: "bad",
      user: { id: "bb_x", email: "x@x.com" },
    });
    expect(outcome).toEqual({ status: "denied", reason: "not-a-member" });
  });

  it("DENIES as misconfigured when SYSTEM_SECRET is absent (cannot pin the tenant)", async () => {
    delete process.env.SYSTEM_SECRET;
    listMock.mockResolvedValue([wsWithMember(TENANT_WS, "bb_owner", "owner")]);
    const outcome = await bridgeBuildbaseSession({
      sessionId: "valid",
      user: { id: "bb_owner", email: "o@t.com" },
    });
    expect(outcome).toEqual({ status: "denied", reason: "misconfigured" });
  });
});

describe("bridgeBuildbaseSession — self-host (TENANT_WORKSPACE_ID unset): no gate", () => {
  it("admits any authenticated user without a membership check and bootstraps ownership", async () => {
    const outcome = await bridgeBuildbaseSession({
      sessionId: "s",
      user: { id: "bb_solo", email: "solo@example.com" },
    });
    expect(outcome.status).toBe("granted");
    if (outcome.status !== "granted") return;
    expect(outcome.workspaceToken).toBe(""); // nothing to pin in self-host
    expect(listMock).not.toHaveBeenCalled(); // buildbase membership never consulted
    expect(provisionMock).toHaveBeenCalledOnce();
  });
});

describe("roleFromBuildbase (documentation mapping — not stored in mc_session)", () => {
  it("owner/admin map to manage; everyone else to member", () => {
    expect(roleFromBuildbase("owner")).toBe("manage");
    expect(roleFromBuildbase("ADMIN")).toBe("manage");
    expect(roleFromBuildbase("member")).toBe("member");
    expect(roleFromBuildbase(undefined)).toBe("member");
  });
});
