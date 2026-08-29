import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { isSystemShutdown } from "../../src/server/system-settings";

/**
 * Guard test for the system kill-switch mutations (RBAC audit fix).
 *
 * `setSystemShutdown` was previously reachable with NO authorization at all — an anonymous
 * request could flip the global kill switch. It is now `requireRole(ctx, "admin")`. Auth is
 * simulated via a signed bb-workspace-token cookie that resolveTenancy verifies.
 */
const SECRET = "system-guards-test-secret";
const WS = "ws_sys_test";

async function runGraphQL(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  if (!text) return { data: undefined, errors: [{ message: "Empty response" }] };
  return JSON.parse(text) as { data?: any; errors?: { message: string; extensions?: any }[] };
}

async function cookieFor(role: "admin" | "member" | "viewer") {
  const token = await createJWT({ userId: "u_sys", workspaceId: WS, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

const MUTATION = `
  mutation SetSystemShutdown($active: Boolean!) {
    setSystemShutdown(active: $active) { shutdownActive }
  }
`;

describe("system kill-switch RBAC guard", () => {
  beforeAll(async () => {
    process.env.SYSTEM_SECRET = SECRET;
  });

  afterAll(async () => {
    // Leave the system un-shut-down for any later suites in the worker.
    await runGraphQL(MUTATION, { active: false }, await cookieFor("admin"));
  });

  it("denies an unauthenticated request and does not change shutdown state", async () => {
    const before = await isSystemShutdown();
    const result = await runGraphQL(MUTATION, { active: true });

    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.data?.setSystemShutdown).toBeFalsy();
    expect(await isSystemShutdown()).toBe(before);
  });

  it("denies a member (non-admin) and does not change shutdown state", async () => {
    const before = await isSystemShutdown();
    const result = await runGraphQL(MUTATION, { active: true }, await cookieFor("member"));

    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.data?.setSystemShutdown).toBeFalsy();
    expect(await isSystemShutdown()).toBe(before);
  });

  it("allows an admin to toggle the system kill switch", async () => {
    const result = await runGraphQL(MUTATION, { active: true }, await cookieFor("admin"));

    expect(result.errors).toBeFalsy();
    expect(result.data.setSystemShutdown.shutdownActive).toBe(true);
    expect(await isSystemShutdown()).toBe(true);
  });
});
