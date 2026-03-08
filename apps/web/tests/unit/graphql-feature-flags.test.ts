import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { POST } from "../../app/api/graphql/route";

/**
 * Integration test for feature flag GraphQL query + mutation.
 * Requires DB (runs with default vitest config + setup).
 */
async function runGraphQL(query: string, variables?: Record<string, unknown>) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  if (!text) return { data: undefined, errors: [{ message: "Empty response" }] };
  return JSON.parse(text) as { data?: any; errors?: { message: string; extensions?: any }[] };
}

describe("GraphQL feature flags", () => {
  beforeAll(async () => {
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

    it("toggles a user-managed flag", async () => {
      const result = await runGraphQL(MUTATION, { key: "test_user_flag", enabled: false });

      expect(result.errors).toBeFalsy();
      expect(result.data.updateFeatureFlag.key).toBe("test_user_flag");
      expect(result.data.updateFeatureFlag.enabled).toBe(false);
      expect(result.data.updateFeatureFlag.managedBy).toBe("user");

      // Verify in DB
      const flag = await prisma.featureFlag.findUnique({ where: { key: "test_user_flag" } });
      expect(flag?.enabled).toBe(false);
    });

    it("can re-enable a disabled flag", async () => {
      const result = await runGraphQL(MUTATION, { key: "test_disabled_flag", enabled: true });

      expect(result.errors).toBeFalsy();
      expect(result.data.updateFeatureFlag.enabled).toBe(true);
    });

    it("rejects toggling a system-managed flag", async () => {
      const result = await runGraphQL(MUTATION, { key: "test_system_flag", enabled: false });

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.data?.updateFeatureFlag).toBeNull();

      // Verify flag was NOT changed
      const flag = await prisma.featureFlag.findUnique({ where: { key: "test_system_flag" } });
      expect(flag?.enabled).toBe(true);
    });

    it("returns error for nonexistent flag", async () => {
      const result = await runGraphQL(MUTATION, { key: "does_not_exist", enabled: true });

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.data?.updateFeatureFlag).toBeNull();
    });
  });
});
