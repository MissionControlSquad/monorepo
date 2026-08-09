import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  startCliAuth,
  pollCliAuth,
  approveCliAuth,
  denyCliAuth,
} from "../../src/server/services/cli-auth";

/**
 * CLI device-authorization flow (Epic #12). Exercises the service end-to-end (start → poll →
 * approve → poll-once) plus the GraphQL approve gate (admin + API_KEYS).
 */
const SECRET = "cliauth-secret";
const WS_A = "ws_cli_A";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text
    ? (JSON.parse(text) as { data?: any; errors?: { message: string }[] })
    : { errors: [] };
}
async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: "human_1", workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE cli_auth_challenges, api_keys CASCADE`);
});

describe("cli device-auth flow", () => {
  it("start → pending → approve → the key is delivered exactly once", async () => {
    const { deviceCode, userCode } = await startCliAuth("my-cli");

    expect((await pollCliAuth(deviceCode)).status).toBe("pending");

    const approved = await approveCliAuth({ userCode, workspaceId: WS_A, profileId: "human_1" });
    expect(approved.keyName).toBe("my-cli");
    // a real ApiKey was minted for the approver's workspace
    expect(await prisma.apiKey.count({ where: { workspaceId: WS_A } })).toBe(1);

    const first = await pollCliAuth(deviceCode);
    expect(first.status).toBe("approved");
    expect(first.apiKey).toMatch(/^mc_/);

    // second poll no longer returns the secret
    const second = await pollCliAuth(deviceCode);
    expect(second.status).toBe("approved");
    expect(second.apiKey).toBeUndefined();
  });

  it("an expired challenge cannot be approved", async () => {
    // Backdate past the 10-min TTL so the challenge is already expired at real "now".
    const past = new Date(Date.now() - 11 * 60_000);
    const { userCode, deviceCode } = await startCliAuth("cli", past);
    await expect(
      approveCliAuth({ userCode, workspaceId: WS_A, profileId: "human_1" }),
    ).rejects.toThrow();
    expect((await pollCliAuth(deviceCode)).status).toBe("expired");
  });

  it("deny blocks approval", async () => {
    const { userCode, deviceCode } = await startCliAuth();
    expect(await denyCliAuth(userCode)).toBe(true);
    expect((await pollCliAuth(deviceCode)).status).toBe("denied");
    await expect(
      approveCliAuth({ userCode, workspaceId: WS_A, profileId: "human_1" }),
    ).rejects.toThrow();
  });

  it("approveCliAuth via GraphQL requires an admin", async () => {
    const { userCode } = await startCliAuth();
    const M = `mutation($c:String!){ approveCliAuth(userCode:$c){ keyName } }`;

    const denied = await gql(M, { c: userCode }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined();
    expect(denied.data?.approveCliAuth).toBeFalsy();

    const ok = await gql(M, { c: userCode }, await cookieFor(WS_A, "admin"));
    expect(ok.errors).toBeFalsy();
    expect(ok.data.approveCliAuth.keyName).toBe("CLI");
  });
});
