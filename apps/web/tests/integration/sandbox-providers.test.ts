import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import {
  getSandboxProvider,
  listSandboxProviders,
  isSandboxProviderConfigured,
  SANDBOX_PROVIDER_KEYS,
} from "../../src/server/services/sandbox-providers";

// Tier D: sandbox provider abstraction. `local` is real (no keys); the 7 cloud providers are
// registered but require an API key + SDK to provision (honest stubs, not faked).
const SECRET = "sbx-secret";
const WS = "ws_sbx";

async function gql(query: string, role: "admin" | "member" = "member") {
  const token = await createJWT({ userId: "h", workspaceId: WS, userRole: role }, SECRET);
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query }),
  });
  return JSON.parse(await (await GRAPHQL(req)).text()) as {
    data?: any;
    errors?: { message: string }[];
  };
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.featureFlag.deleteMany({ where: { key: "runners" } });
  invalidateFlagCache();
});

describe("sandbox providers (Tier D)", () => {
  it("registers local + the 7 cloud providers", () => {
    expect(SANDBOX_PROVIDER_KEYS).toEqual([
      "local",
      "e2b",
      "daytona",
      "modal",
      "novita",
      "cloudflare",
      "kubernetes",
      "exe-dev",
    ]);
    expect(listSandboxProviders().find((p) => p.key === "local")!.requiresApiKey).toBe(false);
  });

  it("the local provider really provisions, execs a command, and tears down", async () => {
    const provider = getSandboxProvider("local")!;
    const box = await provider.provision();
    const r = await box.exec("echo hello-from-sandbox && pwd");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hello-from-sandbox");
    expect(r.stdout).toContain(box.id); // pwd == the sandbox temp dir
    await box.destroy();
  });

  it("per-deployment config: a provider is configured only when its env keys are set", () => {
    const e2b = getSandboxProvider("e2b")!;
    expect(e2b.credentialEnvKeys).toEqual(["E2B_API_KEY"]);
    expect(isSandboxProviderConfigured(e2b, {})).toBe(false);
    expect(isSandboxProviderConfigured(e2b, { E2B_API_KEY: "sk_x" })).toBe(true);
    // multi-key provider needs all keys
    const modal = getSandboxProvider("modal")!;
    expect(isSandboxProviderConfigured(modal, { MODAL_TOKEN_ID: "a" })).toBe(false);
    expect(
      isSandboxProviderConfigured(modal, { MODAL_TOKEN_ID: "a", MODAL_TOKEN_SECRET: "b" }),
    ).toBe(true);
    // local needs nothing
    expect(isSandboxProviderConfigured(getSandboxProvider("local")!, {})).toBe(true);
  });

  it("a cloud provider provision throws a clear error (not-configured vs SDK-pending)", async () => {
    const e2b = getSandboxProvider("e2b")!;
    expect(e2b.requiresApiKey).toBe(true);
    // Without the env key set → not configured on this deployment.
    await expect(e2b.provision()).rejects.toThrow(/not configured|E2B_API_KEY|SDK/i);
  });

  it("sandboxProviders query lists them with availability; RUNNERS-gated", async () => {
    await prisma.featureFlag.upsert({
      where: { key: "runners" },
      create: { key: "runners", enabled: true, managedBy: "user" },
      update: { enabled: true },
    });
    invalidateFlagCache();
    const res = await gql(`query{ sandboxProviders{ key requiresApiKey configured available } }`);
    expect(res.errors).toBeFalsy();
    const local = res.data.sandboxProviders.find((p: { key: string }) => p.key === "local");
    expect(local).toMatchObject({ available: true, configured: true, requiresApiKey: false });
    const e2b = res.data.sandboxProviders.find((p: { key: string }) => p.key === "e2b");
    expect(e2b).toMatchObject({ available: false, requiresApiKey: true }); // configured depends on env

    // gated
    await prisma.featureFlag.upsert({
      where: { key: "runners" },
      create: { key: "runners", enabled: false, managedBy: "user" },
      update: { enabled: false },
    });
    invalidateFlagCache();
    expect((await gql(`query{ sandboxProviders{ key } }`)).errors).toBeDefined();
  });
});
