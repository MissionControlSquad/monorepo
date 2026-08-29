import { describe, it, expect } from "vitest";
import { serverSchema } from "@/server/env";
import { isBuildbaseConfigured } from "@/server/tenancy/buildbase";

// A minimal set of the genuinely-required vars, so we can assert the buildbase additions are OPTIONAL
// on top of an otherwise-valid env (absent = fine) and never accidentally required.
const REQUIRED_BASE = {
  POSTGRES_PRISMA_URL: "postgresql://u:p@localhost:5432/db",
  POSTGRES_URL_NON_POOLING: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "a-sufficiently-long-secret",
  CRON_SECRET: "cron-secret",
} as const;

describe("env schema — buildbase vars are all optional", () => {
  it("parses with NONE of the buildbase vars set (dormant self-hosted deploy)", () => {
    const parsed = serverSchema.safeParse({ ...REQUIRED_BASE });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.SAAS_ORG_ID).toBeUndefined();
      expect(parsed.data.SAAS_SERVER_URL).toBeUndefined();
      expect(parsed.data.NEXT_PUBLIC_SAAS_ORG_ID).toBeUndefined();
      expect(parsed.data.NEXT_PUBLIC_APP_URL).toBeUndefined();
      expect(parsed.data.BUILDBASE_MCP_SECRET).toBeUndefined();
      expect(parsed.data.BUILDBASE_SERVICE_SESSION_ID).toBeUndefined();
    }
  });

  it("parses when the buildbase vars ARE set (provisioned deploy)", () => {
    const parsed = serverSchema.safeParse({
      ...REQUIRED_BASE,
      SAAS_SERVER_URL: "https://api.console.buildbase.app",
      SAAS_ORG_ID: "0123456789abcdef01234567",
      SAAS_CLIENT_ID: "client-abc",
      SAAS_CLIENT_SECRET: "secret-xyz",
      NEXT_PUBLIC_SAAS_SERVER_URL: "https://api.console.buildbase.app",
      NEXT_PUBLIC_SAAS_ORG_ID: "0123456789abcdef01234567",
      NEXT_PUBLIC_SAAS_CLIENT_ID: "client-abc",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
      BUILDBASE_MCP_SECRET: "mcp-secret",
      BUILDBASE_SERVICE_SESSION_ID: "svc-session",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.SAAS_ORG_ID).toBe("0123456789abcdef01234567");
      expect(parsed.data.NEXT_PUBLIC_APP_URL).toBe("https://app.example.com");
      expect(parsed.data.BUILDBASE_MCP_SECRET).toBe("mcp-secret");
    }
  });

  it("treats empty-string URLs as undefined (not a validation error)", () => {
    const parsed = serverSchema.safeParse({
      ...REQUIRED_BASE,
      SAAS_SERVER_URL: "",
      NEXT_PUBLIC_SAAS_SERVER_URL: "",
      NEXT_PUBLIC_APP_URL: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.SAAS_SERVER_URL).toBeUndefined();
      expect(parsed.data.NEXT_PUBLIC_APP_URL).toBeUndefined();
    }
  });

  it("rejects a malformed URL when one IS provided", () => {
    const parsed = serverSchema.safeParse({
      ...REQUIRED_BASE,
      SAAS_SERVER_URL: "not-a-url",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("buildbase dormant gate", () => {
  it("isBuildbaseConfigured() is false when no org id is set (graceful degradation)", () => {
    // The test env sets no SAAS_ORG_ID, so the human-tenancy plane stays dormant: getBuildbase()
    // returns null and the Account & security surface renders its provisioned-later state.
    expect(isBuildbaseConfigured()).toBe(false);
  });
});
