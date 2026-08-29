import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { createSecret } from "../../src/server/services/secrets";
import {
  getSandboxProvider,
  listSandboxProviders,
  isSandboxProviderConfigured,
  SANDBOX_PROVIDER_KEYS,
  type SandboxSecretResolver,
} from "../../src/server/services/sandbox-providers";

// Tier D: sandbox providers. `local` is real (no keys); the 7 cloud providers are BYO — credentials
// come from the caller's WORKSPACE secrets vault (resolved by name), never from deployment env.
const SECRET = "sbx-secret";
const WS = "ws_sbx";

/** An in-memory resolver standing in for the workspace vault. */
const vault =
  (secrets: Record<string, string>): SandboxSecretResolver =>
  async (name) =>
    secrets[name] ?? null;

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

/** Delete all vault secrets for the test workspace (children first — no reliance on cascade). */
async function clearVault() {
  const ids = (
    await prisma.secret.findMany({ where: { workspaceId: WS }, select: { id: true } })
  ).map((s) => s.id);
  if (ids.length) {
    await prisma.secretVersion.deleteMany({ where: { secretId: { in: ids } } });
    await prisma.secretAccessEvent.deleteMany({ where: { secretId: { in: ids } } });
    await prisma.secret.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  resetTestFeature(FLAG_KEYS.RUNNERS);
  invalidateFlagCache();
  await clearVault();
});

describe("sandbox providers (Tier D — BYO)", () => {
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
    // local runs on the host (not isolating); cloud providers isolate untrusted code.
    expect(getSandboxProvider("local")!.isolating).toBe(false);
    expect(getSandboxProvider("e2b")!.isolating).toBe(true);
  });

  it("the local provider really provisions, execs a command, and tears down", async () => {
    const provider = getSandboxProvider("local")!;
    const box = await provider.provision({ workspaceId: WS, resolveSecret: async () => null });
    const r = await box.exec("echo hello-from-sandbox && pwd");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hello-from-sandbox");
    expect(r.stdout).toContain(box.id); // pwd == the sandbox temp dir
    await box.destroy();
  });

  it("per-workspace config: a provider is configured only when the vault has its secrets", async () => {
    const e2b = getSandboxProvider("e2b")!;
    expect(e2b.credentialKeys).toEqual(["E2B_API_KEY"]);
    expect(await isSandboxProviderConfigured(e2b, vault({}))).toBe(false);
    expect(await isSandboxProviderConfigured(e2b, vault({ E2B_API_KEY: "sk_x" }))).toBe(true);
    // multi-key provider needs all its secrets
    const modal = getSandboxProvider("modal")!;
    expect(await isSandboxProviderConfigured(modal, vault({ MODAL_TOKEN_ID: "a" }))).toBe(false);
    expect(
      await isSandboxProviderConfigured(
        modal,
        vault({ MODAL_TOKEN_ID: "a", MODAL_TOKEN_SECRET: "b" }),
      ),
    ).toBe(true);
    // local needs nothing
    expect(await isSandboxProviderConfigured(getSandboxProvider("local")!, vault({}))).toBe(true);
  });

  it("a cloud provision throws a clear not-configured error when the workspace vault lacks the key", async () => {
    const e2b = getSandboxProvider("e2b")!;
    expect(e2b.requiresApiKey).toBe(true);
    await expect(
      e2b.provision({ workspaceId: WS, resolveSecret: async () => null }),
    ).rejects.toThrow(/not configured|E2B_API_KEY|vault/i);
  });

  it("sandboxProviders query reflects the workspace vault; RUNNERS-gated", async () => {
    setTestFeature(FLAG_KEYS.RUNNERS, true);
    invalidateFlagCache();

    // No secrets yet → cloud providers are not configured; local is always available.
    let res = await gql(
      `query{ sandboxProviders{ key requiresApiKey isolating configured available } }`,
    );
    expect(res.errors).toBeFalsy();
    const local = res.data.sandboxProviders.find((p: { key: string }) => p.key === "local");
    expect(local).toMatchObject({
      available: true,
      configured: true,
      requiresApiKey: false,
      isolating: false,
    });
    let e2b = res.data.sandboxProviders.find((p: { key: string }) => p.key === "e2b");
    expect(e2b).toMatchObject({ available: false, configured: false, requiresApiKey: true });

    // Store the workspace's own E2B key in the vault → BYO resolution flips it to configured.
    await createSecret({
      workspaceId: WS,
      name: "E2B_API_KEY",
      value: "sk_workspace",
      createdBy: "h",
    });
    res = await gql(`query{ sandboxProviders{ key configured available } }`);
    e2b = res.data.sandboxProviders.find((p: { key: string }) => p.key === "e2b");
    expect(e2b).toMatchObject({ configured: true, available: true });

    // gated
    setTestFeature(FLAG_KEYS.RUNNERS, false);
    invalidateFlagCache();
    expect((await gql(`query{ sandboxProviders{ key } }`)).errors).toBeDefined();
  });
});
