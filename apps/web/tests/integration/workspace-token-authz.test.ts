import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "../../app/api/auth/buildbase/workspace-token/route";
import { createJWT, verifyJWT } from "../../src/lib/jwt";

// Regression (SECURITY BLOCKER): the workspace-token mint must derive identity + role from the VERIFIED
// bearer claims, never the request body — otherwise any authenticated user could mint an owner token for
// any workspace.
const SYSTEM_SECRET = "workspace-token-test-secret";

beforeAll(() => {
  process.env.SYSTEM_SECRET = SYSTEM_SECRET;
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
