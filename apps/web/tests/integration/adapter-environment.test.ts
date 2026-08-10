import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { invalidateFlagCache } from "../../src/server/feature-flags";

// Mock the runtime probe so the resolver + service run for real but no CLI is ever spawned.
const probeMock = vi.fn();
vi.mock("../../src/server/services/ai-runtime-detect", () => ({
  probeRuntimeBin: (bin: string, args: string[]) => probeMock(bin, args),
}));

import { POST as GRAPHQL } from "../../app/api/graphql/route";

// testAdapterEnvironment query — MULTI_PROVIDER_ADAPTERS gated + admin-only. Mirrors runtime-adapters.test.
const SECRET = "adapter-env-secret";
const WS = "ws_adapter_env";
const FLAG = "multi_provider_adapters";

async function gql(query: string, role: "admin" | "member" = "admin", variables?: unknown) {
  const token = await createJWT({ userId: "h", workspaceId: WS, userRole: role }, SECRET);
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return JSON.parse(await (await GRAPHQL(req)).text()) as {
    data?: any;
    errors?: { message: string }[];
  };
}

async function setFlag(enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { key: FLAG },
    create: { key: FLAG, enabled, managedBy: "user" },
    update: { enabled },
  });
  invalidateFlagCache();
}

const QUERY = `
  query ($key: String!) {
    testAdapterEnvironment(key: $key) {
      ok
      errorFamily
      checks { name ok detail }
    }
  }
`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  probeMock.mockReset();
  await prisma.featureFlag.deleteMany({ where: { key: FLAG } });
  invalidateFlagCache();
});

describe("testAdapterEnvironment query (adapter preflight)", () => {
  it("returns green checks for an installed CLI (admin + flag on)", async () => {
    await setFlag(true);
    probeMock.mockResolvedValue({ installed: true, version: "1.2.3", output: "claude 1.2.3" });
    const res = await gql(QUERY, "admin", { key: "claude" });
    expect(res.errors).toBeFalsy();
    expect(res.data.testAdapterEnvironment.ok).toBe(true);
    expect(res.data.testAdapterEnvironment.checks).toHaveLength(3);
    expect(res.data.testAdapterEnvironment.checks[0]).toMatchObject({
      name: "CLI installed",
      ok: true,
    });
  });

  it("returns red checks with readable reasons for a missing CLI", async () => {
    await setFlag(true);
    probeMock.mockResolvedValue({ installed: false, version: null, output: "" });
    const res = await gql(QUERY, "admin", { key: "gemini" });
    expect(res.errors).toBeFalsy();
    expect(res.data.testAdapterEnvironment.ok).toBe(false);
    const installed = res.data.testAdapterEnvironment.checks.find(
      (c: { name: string }) => c.name === "CLI installed",
    );
    expect(installed.ok).toBe(false);
    expect(installed.detail).toMatch(/not found on PATH/i);
  });

  it("is MULTI_PROVIDER_ADAPTERS-gated (flag off → error, never probes)", async () => {
    await setFlag(false);
    const res = await gql(QUERY, "admin", { key: "claude" });
    expect(res.errors).toBeDefined();
    expect(probeMock).not.toHaveBeenCalled();
  });

  it("is admin-gated (member → error, never probes)", async () => {
    await setFlag(true);
    const res = await gql(QUERY, "member", { key: "claude" });
    expect(res.errors).toBeDefined();
    expect(probeMock).not.toHaveBeenCalled();
  });
});
