import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";

/**
 * Integration test for feature flag GraphQL query + mutation.
 * Requires DB (runs with default vitest config + setup).
 *
 * `updateFeatureFlag` is admin-gated (governance/config action), so the mutation cases
 * authenticate via a signed bb-workspace-token cookie that resolveTenancy verifies.
 */
const SECRET = "feature-flags-test-secret";
const WS = "ws_ff_test";

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
  const token = await createJWT({ userId: "u_ff", workspaceId: WS, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

describe("GraphQL feature flags", () => {
  beforeAll(async () => {
    process.env.SYSTEM_SECRET = SECRET;
    // Seed test flags
    await prisma.featureFlag.createMany({
      data: [
        { key: "test_system_flag", enabled: true, managedBy: "system", description: "System flag" },
        { key: "test_user_flag", enabled: true, managedBy: "user", description: "User flag" },
        { key: "test_disabled_flag", enabled: false, managedBy: "user", description: "Disabled" },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({
      where: { key: { startsWith: "test_" } },
    });
  });

  describe("featureFlags query", () => {
    it("returns all flags", async () => {
      const result = await runGraphQL(
        `query { featureFlags { key enabled managedBy description } }`,
      );

      expect(result.errors).toBeFalsy();
      const flags = result.data.featureFlags as any[];
      expect(flags.length).toBeGreaterThanOrEqual(3);

      const systemFlag = flags.find((f: any) => f.key === "test_system_flag");
      expect(systemFlag).toBeDefined();
      expect(systemFlag.enabled).toBe(true);
      expect(systemFlag.managedBy).toBe("system");
    });
  });

  describe("updateFeatureFlag mutation", () => {
    const MUTATION = `
      mutation UpdateFeatureFlag($key: String!, $enabled: Boolean!) {
        updateFeatureFlag(key: $key, enabled: $enabled) {
          key
          enabled
          managedBy
          description
        }
      }
    `;

    it("toggles a user-managed flag (admin)", async () => {
      const result = await runGraphQL(
        MUTATION,
        { key: "test_user_flag", enabled: false },
        await cookieFor("admin"),
      );

      expect(result.errors).toBeFalsy();
      expect(result.data.updateFeatureFlag.key).toBe("test_user_flag");
      expect(result.data.updateFeatureFlag.enabled).toBe(false);
      expect(result.data.updateFeatureFlag.managedBy).toBe("user");

      // Verify in DB
      const flag = await prisma.featureFlag.findUnique({ where: { key: "test_user_flag" } });
      expect(flag?.enabled).toBe(false);
    });

    it("can re-enable a disabled flag (admin)", async () => {
      const result = await runGraphQL(
        MUTATION,
        { key: "test_disabled_flag", enabled: true },
        await cookieFor("admin"),
      );

      expect(result.errors).toBeFalsy();
      expect(result.data.updateFeatureFlag.enabled).toBe(true);
    });

    it("rejects toggling a system-managed flag (admin)", async () => {
      const result = await runGraphQL(
        MUTATION,
        { key: "test_system_flag", enabled: false },
        await cookieFor("admin"),
      );

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.data?.updateFeatureFlag).toBeNull();

      // Verify flag was NOT changed
      const flag = await prisma.featureFlag.findUnique({ where: { key: "test_system_flag" } });
      expect(flag?.enabled).toBe(true);
    });

    it("returns error for nonexistent flag (admin)", async () => {
      const result = await runGraphQL(
        MUTATION,
        { key: "does_not_exist", enabled: true },
        await cookieFor("admin"),
      );

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.data?.updateFeatureFlag).toBeNull();
    });

    it("denies a member (non-admin) toggling a flag, and does not change the flag", async () => {
      const result = await runGraphQL(
        MUTATION,
        { key: "test_user_flag", enabled: true },
        await cookieFor("member"),
      );

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.data?.updateFeatureFlag).toBeFalsy();

      // Unchanged from the earlier admin toggle (still false).
      const flag = await prisma.featureFlag.findUnique({ where: { key: "test_user_flag" } });
      expect(flag?.enabled).toBe(false);
    });

    it("denies an unauthenticated request (no tenancy)", async () => {
      const result = await runGraphQL(MUTATION, { key: "test_disabled_flag", enabled: false });

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.data?.updateFeatureFlag).toBeFalsy();
    });
  });
});
