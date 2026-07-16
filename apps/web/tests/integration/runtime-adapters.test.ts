import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";

// Tier D: the control plane exposes the runtime adapter registry (RUNNERS-gated, member+).
const SECRET = "adapters-secret";
const WS = "ws_adapters";

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

describe("runtimeAdapters query (Tier D)", () => {
  it("returns the built-in adapters when RUNNERS is on", async () => {
    await prisma.featureFlag.upsert({
      where: { key: "runners" },
      create: { key: "runners", enabled: true, managedBy: "user" },
      update: { enabled: true },
    });
    invalidateFlagCache();
    const res = await gql(
      `query{ runtimeAdapters{ key displayName requiresTemplate supportsModel models } }`,
    );
    expect(res.errors).toBeFalsy();
    const keys = res.data.runtimeAdapters.map((a: { key: string }) => a.key);
    expect(keys).toEqual(
      expect.arrayContaining(["openclaw", "codex", "claude", "gemini", "process", "shell"]),
    );
    const shell = res.data.runtimeAdapters.find((a: { key: string }) => a.key === "shell");
    expect(shell.requiresTemplate).toBe(true);
  });

  it("is RUNNERS-gated", async () => {
    await prisma.featureFlag.upsert({
      where: { key: "runners" },
      create: { key: "runners", enabled: false, managedBy: "user" },
      update: { enabled: false },
    });
    invalidateFlagCache();
    const res = await gql(`query{ runtimeAdapters{ key } }`);
    expect(res.errors).toBeDefined();
  });
});
