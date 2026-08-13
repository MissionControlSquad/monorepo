import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { ensureUserAndProfileForBuildbase } from "@agentcenter/database";
import { ProfileKind } from "@agentcenter/utils";
import { verifySessionToken } from "../../src/server/admin-auth";
import { verifyJWT } from "../../src/lib/jwt";

// Real Postgres. Exercises the auth bridge end-to-end: Profile upsert idempotency, the OAuth token
// route + auto-SSO route minting mc_session ONLY for members of this tenant's bound buildbase
// workspace (membership + session validation mocked), and resolveTenancy pinning. Security-critical.

const TENANT_WS = "ws_tenant_integration";
const SYSTEM_SECRET = "test-system-secret-1234567890";

// ── Mock the buildbase server factory (no network / real SDK). Membership + session validation are
//    driven by listMock / getProfileMock. ──
const listMock = vi.fn(async () => [] as unknown[]);
const getProfileMock = vi.fn();
vi.mock("@/server/tenancy/buildbase", () => ({
  BB_SESSION_COOKIE: "bb-session-id",
  isBuildbaseConfigured: () => true,
  getBuildbase: () => ({
    withSession: () => ({
      workspace: { list: listMock },
      users: { getProfile: getProfileMock },
    }),
  }),
}));

function wsWithMember(id: string, userId: string, role: string) {
  return { _id: id, workspaceId: id, users: [{ _id: userId }], roles: [role] };
}

function cookieValue(setCookies: string[], name: string): string | undefined {
  const match = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!match) return undefined;
  return match.slice(name.length + 1).split(";")[0] || undefined;
}

beforeAll(() => {
  process.env.SAAS_ORG_ID = "69e6895aa53f542558f527a9";
  process.env.SAAS_CLIENT_ID = "test-client-id";
  process.env.SAAS_CLIENT_SECRET = "test-client-secret";
  process.env.SYSTEM_SECRET = SYSTEM_SECRET;
  process.env.TENANT_WORKSPACE_ID = TENANT_WS;
});

afterAll(() => {
  // Do NOT let TENANT_WORKSPACE_ID leak to other test files (they rely on the default fallback).
  delete process.env.TENANT_WORKSPACE_ID;
});

afterEach(() => {
  vi.restoreAllMocks();
  listMock.mockReset().mockResolvedValue([]);
  getProfileMock.mockReset();
});

describe("ensureUserAndProfileForBuildbase (Profile upsert)", () => {
  it("creates a human Profile keyed to the buildbase user, and is idempotent", async () => {
    const bbId = `bb_${Date.now()}_a`;
    const first = await ensureUserAndProfileForBuildbase({
      buildbaseUserId: bbId,
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
    const profile = await prisma.profile.findUnique({ where: { id: first.profileId } });
    expect(profile).not.toBeNull();
    expect(profile!.kind).toBe(ProfileKind.HUMAN);
    expect(profile!.buildbaseUserId).toBe(bbId);

    const second = await ensureUserAndProfileForBuildbase({ buildbaseUserId: bbId });
    expect(second.profileId).toBe(first.profileId);
    expect(await prisma.profile.count({ where: { buildbaseUserId: bbId } })).toBe(1);
  });
});

describe("POST /api/auth/buildbase/token (OAuth → membership-gated mc_session)", () => {
  async function callToken(bbId: string, email: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: { sessionId: "sess_1", user: { id: bbId, email, name: "N", role: "member" } },
        }),
      ),
    );
    const { POST } = await import("../../app/api/auth/buildbase/token/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL("http://localhost:3000/api/auth/buildbase/token"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "oauth-code-abcdefgh" }),
    });
    return POST(req);
  }

  it("MEMBER → mints mc_session + bb-workspace-token pinned to the tenant workspace with role", async () => {
    const bbId = `bb_${Date.now()}_member`;
    listMock.mockResolvedValue([wsWithMember(TENANT_WS, bbId, "owner")]);

    const res = await callToken(bbId, "owner@tenant.com");
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();

    const mcValue = cookieValue(setCookies, "mc_session");
    expect(mcValue).toBeTruthy();
    const payload = await verifySessionToken(mcValue!);
    expect(payload!.sub).toBe(bbId);

    const wsToken = cookieValue(setCookies, "bb-workspace-token");
    expect(wsToken).toBeTruthy();
    const claims = await verifyJWT(wsToken!, SYSTEM_SECRET);
    expect(claims!.workspaceId).toBe(TENANT_WS);
    expect(claims!.userRole).toBe("owner");

    expect(await prisma.profile.findUnique({ where: { buildbaseUserId: bbId } })).not.toBeNull();
  });

  it("NON-MEMBER → 403, mints nothing (cross-tenant fail-closed)", async () => {
    const bbId = `bb_${Date.now()}_intruder`;
    listMock.mockResolvedValue([wsWithMember("ws_other", bbId, "owner")]); // not this tenant
    const res = await callToken(bbId, "intruder@other.com");
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await prisma.profile.findUnique({ where: { buildbaseUserId: bbId } })).toBeNull();
  });
});

describe("GET /api/auth/buildbase/sso (auto-SSO, membership-gated)", () => {
  async function callSso(returnTo = "/kanban", cookie = "bb-session-id=valid_sess") {
    const { GET } = await import("../../app/api/auth/buildbase/sso/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(
      new URL(
        `http://localhost:3000/api/auth/buildbase/sso?returnTo=${encodeURIComponent(returnTo)}`,
      ),
      { headers: { cookie } },
    );
    return GET(req);
  }

  it("MEMBER → mints mc_session + workspace-token and redirects to returnTo", async () => {
    const bbId = `bb_${Date.now()}_sso`;
    getProfileMock.mockResolvedValue({ _id: bbId, email: "sso@tenant.com", role: "member" });
    listMock.mockResolvedValue([wsWithMember(TENANT_WS, bbId, "member")]);

    const res = await callSso("/kanban");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/kanban");
    const setCookies = res.headers.getSetCookie();
    expect(cookieValue(setCookies, "mc_session")).toBeTruthy();
    const wsToken = cookieValue(setCookies, "bb-workspace-token");
    expect((await verifyJWT(wsToken!, SYSTEM_SECRET))!.workspaceId).toBe(TENANT_WS);
  });

  it("VALID session but NON-MEMBER → redirects to /no-access, mints nothing", async () => {
    const bbId = `bb_${Date.now()}_sso_deny`;
    getProfileMock.mockResolvedValue({ _id: bbId, email: "x@other.com", role: "member" });
    listMock.mockResolvedValue([wsWithMember("ws_other", bbId, "owner")]);

    const res = await callSso("/kanban");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/no-access");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("INVALID buildbase session (getProfile throws) → redirects to /login, mints nothing", async () => {
    getProfileMock.mockRejectedValue(new Error("401 session revoked"));
    const res = await callSso("/kanban", "bb-session-id=bad_sess");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an off-origin returnTo (open-redirect guard) → uses /", async () => {
    const bbId = `bb_${Date.now()}_openredir`;
    getProfileMock.mockResolvedValue({ _id: bbId, email: "m@tenant.com", role: "member" });
    listMock.mockResolvedValue([wsWithMember(TENANT_WS, bbId, "member")]);
    const res = await callSso("https://evil.com/x");
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("http://localhost:3000");
    expect(loc.pathname).toBe("/");
  });
});

describe("resolveTenancy — TENANT_WORKSPACE_ID pinning (no default fallback for non-members)", () => {
  it("resolves to the bound workspace from a valid bb-workspace-token", async () => {
    const { resolveTenancy } = await import("../../src/server/tenancy/resolve");
    const { createJWT } = await import("../../src/lib/jwt");
    const token = await createJWT(
      { userId: "bb_u", workspaceId: TENANT_WS, userRole: "owner", email: "o@t.com" },
      SYSTEM_SECRET,
    );
    const ctx = await resolveTenancy(
      { sub: "s", username: "u", profileId: "profile_1" },
      `bb-workspace-token=${token}`,
      null,
    );
    expect(ctx?.workspaceId).toBe(TENANT_WS);
    expect(ctx?.role).toBe("owner");
  });

  it("REFUSES the default-workspace fallback for a bare mc_session when a tenant is bound", async () => {
    const { resolveTenancy } = await import("../../src/server/tenancy/resolve");
    // Only an mc_session (session.profileId), no workspace token → must NOT get DEFAULT_WORKSPACE_ID.
    const ctx = await resolveTenancy(
      { sub: "s", username: "u", profileId: "profile_1" },
      null,
      null,
    );
    expect(ctx).toBeNull();
  });
});
