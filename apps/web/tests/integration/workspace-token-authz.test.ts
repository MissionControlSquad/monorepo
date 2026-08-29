import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/auth/buildbase/workspace-token/route";
import { createJWT, verifyJWT } from "../../src/lib/jwt";

// The route re-verifies membership against buildbase inside the bound-tenant switch-block. Mock that one
// function; keep everything else (notably `tenantWorkspaceId`, which reads TENANT_WORKSPACE_ID at call
// time) real so the block's env-driven behavior is exercised for real.
const { verifyMembershipMock } = vi.hoisted(() => ({ verifyMembershipMock: vi.fn() }));
vi.mock("@/server/auth/buildbase-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/buildbase-bridge")>();
  return { ...actual, verifyWorkspaceMembership: verifyMembershipMock };
});

// Regression (SECURITY BLOCKER): the workspace-token mint must derive identity + role from the VERIFIED
// bearer claims, never the request body — otherwise any authenticated user could mint an owner token for
// any workspace.
const SYSTEM_SECRET = "workspace-token-test-secret";

beforeAll(() => {
  process.env.SYSTEM_SECRET = SYSTEM_SECRET;
});

afterEach(() => {
  // Never leak the bound-tenant env into other test files (they rely on the unbound fallback).
  delete process.env.TENANT_WORKSPACE_ID;
  verifyMembershipMock.mockReset();
});

async function callMint(bearer: string, body: unknown) {
  const req = new Request("https://test/api/auth/buildbase/workspace-token", {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req as never);
  return {
    status: res.status,
    json: JSON.parse(await res.text()) as { success: boolean; token?: string },
  };
}

describe("workspace-token mint authz (BLOCKER regression)", () => {
  it("ignores body-supplied userRole/userId — uses the verified bearer claims", async () => {
    // A legitimately-authenticated MEMBER (buildbase-signed bearer).
    const bearer = await createJWT(
      { userId: "real-user", workspaceId: null, userRole: "member", email: "u@x.com" },
      SYSTEM_SECRET,
    );
    // Attacker body tries to escalate to owner + impersonate someone else, on a victim workspace.
    const { status, json } = await callMint(bearer, {
      userId: "victim-admin",
      userRole: "owner",
      email: "attacker@x.com",
      workspaceId: "victim-workspace",
    });
    expect(status).toBe(200);
    const claims = (await verifyJWT(json.token!, SYSTEM_SECRET)) as Record<string, unknown>;
    // Identity + role come from the VERIFIED token, not the body.
    expect(claims.userId).toBe("real-user");
    expect(claims.userRole).toBe("member"); // NOT "owner"
    expect(claims.email).toBe("u@x.com");
    // The body may only choose which workspace to switch to.
    expect(claims.workspaceId).toBe("victim-workspace");
  });

  it("rejects an unsigned / forged bearer", async () => {
    const forged = await createJWT({ userId: "x", userRole: "owner" }, "wrong-secret");
    const { status } = await callMint(forged, { workspaceId: "w" });
    expect(status).toBe(401);
  });
});

describe("workspace-token switch-block (bound tenant, TENANT_WORKSPACE_ID set)", () => {
  const BOUND = "ws_bound_tenant";

  function mintReq(bearer: string, body: unknown, cookie?: string) {
    return new NextRequest("https://test/api/auth/buildbase/workspace-token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function memberBearer() {
    // A legitimate member whose bearer role is deliberately LOWER than what buildbase will report,
    // to prove the minted role comes from buildbase, not the bearer.
    return createJWT(
      { userId: "real-user", workspaceId: null, userRole: "member", email: "u@x.com" },
      SYSTEM_SECRET,
    );
  }

  it("403s a workspaceId that isn't the bound one, WITHOUT consulting buildbase", async () => {
    process.env.TENANT_WORKSPACE_ID = BOUND;
    const res = await POST(mintReq(await memberBearer(), { workspaceId: "some-other-ws" }));
    expect(res.status).toBe(403);
    // Fail-closed BEFORE any membership check — the mismatch alone is disqualifying.
    expect(verifyMembershipMock).not.toHaveBeenCalled();
  });

  it("403s the bound workspace when buildbase says the user is NOT a member", async () => {
    process.env.TENANT_WORKSPACE_ID = BOUND;
    verifyMembershipMock.mockResolvedValue(null); // not a member
    const res = await POST(
      mintReq(await memberBearer(), { workspaceId: BOUND }, "bb-session-id=sess-1"),
    );
    expect(res.status).toBe(403);
    expect(verifyMembershipMock).toHaveBeenCalledWith("sess-1", BOUND, "real-user");
  });

  it("mints pinned to the bound workspace with the role buildbase reports (not the bearer's)", async () => {
    process.env.TENANT_WORKSPACE_ID = BOUND;
    verifyMembershipMock.mockResolvedValue("admin"); // buildbase promotes them here
    const res = await POST(
      mintReq(await memberBearer(), { workspaceId: BOUND }, "bb-session-id=sess-9"),
    );
    expect(res.status).toBe(200);
    const json = JSON.parse(await res.text()) as { token: string };
    const claims = (await verifyJWT(json.token, SYSTEM_SECRET)) as Record<string, unknown>;
    expect(claims.workspaceId).toBe(BOUND);
    expect(claims.userRole).toBe("admin"); // from buildbase, NOT the bearer's "member"
    expect(claims.userId).toBe("real-user");
    // Cookie is pinned to the bound workspace token.
    expect(res.headers.get("set-cookie")).toContain("bb-workspace-token=");
  });
});
