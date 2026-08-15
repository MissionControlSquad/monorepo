import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  AI_RUNTIME_TOOLS,
  NODE_PREREQ,
  installMethodsFor,
  recommendedInstall,
  getRuntimeTool,
  type RuntimeOs,
} from "@agentcenter/utils";

/**
 * AI Tools doctor - real GraphQL route + Postgres, plus the runner-report REST endpoint.
 *
 * detectLocalRuntimes is MOCKED so the result is deterministic (never depends on which CLIs happen to
 * be installed on the CI box): the mock builds a "nothing installed" inventory straight from the pure
 * catalog for the requested OS. We then assert the query faithfully surfaces the catalog's install
 * methods, that a not-installed tool exposes its recommended command, and that a remote runner's posted
 * inventory round-trips through the report endpoint into reportedRuntimeInventories.
 */
vi.mock("@/server/services/ai-runtime-detect", () => ({
  detectLocalRuntimes: vi.fn(async (os: RuntimeOs = "linux") => ({
    os,
    nodeInstalled: false,
    nodeVersion: null,
    nodeInstall: installMethodsFor(NODE_PREREQ, os),
    nodeDocsUrl: NODE_PREREQ.docsUrl,
    tools: AI_RUNTIME_TOOLS.map((t) => ({
      key: t.key,
      displayName: t.displayName,
      binName: t.binName,
      summary: t.summary,
      docsUrl: t.docsUrl,
      installed: false,
      version: null,
      needsNode: recommendedInstall(t, os)?.needs === "node",
      installMethods: installMethodsFor(t, os),
    })),
  })),
}));

import { POST as GQL } from "../../app/api/graphql/route";
import { POST as REPORT } from "../../app/api/runner/ai-tools/route";
import { GET as LOCAL_REST } from "../../app/api/ai-tools/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";

const SECRET = "aitools-secret";
const WS_A = "ws_aitools_A";
const WS_B = "ws_aitools_B";
const KEY = "mc_aitools_runner";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await GQL(req);
  const text = await res.text();
  return text
    ? (JSON.parse(text) as { data?: any; errors?: { message: string }[] })
    : { errors: [] };
}

async function cookieFor(userId: string, workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

async function makeRunner(key: string, workspaceId = WS_A, name = "My Laptop"): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name,
      role: "runner",
      workspaceId,
      setupStatus: "active",
      apiKeyHash: hashApiKey(key),
    },
  });
  return agent.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  agentCache.clear();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE runner_tool_inventories, agents CASCADE`);
});

const INVENTORY_Q = `query($os:String){ aiRuntimeInventory(os:$os){
  os nodeInstalled nodeDocsUrl
  nodeInstall { os label command kind }
  tools { key displayName binName installed version needsNode
    installMethods { os label command kind note needs } }
} }`;

describe("aiRuntimeInventory query", () => {
  it("returns every catalog tool with per-OS install methods for the requested OS", async () => {
    const os: RuntimeOs = "windows";
    const r = await gql(INVENTORY_Q, { os }, await cookieFor("human_1", WS_A, "member"));
    expect(r.errors).toBeFalsy();
    const inv = r.data.aiRuntimeInventory;
    expect(inv.os).toBe("windows");

    // Same set of tools as the pure catalog, in order.
    expect(inv.tools.map((t: any) => t.key)).toEqual(AI_RUNTIME_TOOLS.map((t) => t.key));

    // Each tool's methods match installMethodsFor(tool, os) exactly (commands come from the catalog).
    for (const tool of AI_RUNTIME_TOOLS) {
      const got = inv.tools.find((t: any) => t.key === tool.key);
      const expected = installMethodsFor(tool, os);
      expect(got.installMethods.map((m: any) => m.command)).toEqual(expected.map((m) => m.command));
    }
  });

  it("surfaces a not-installed tool's recommended install command", async () => {
    const os: RuntimeOs = "macos";
    const r = await gql(INVENTORY_Q, { os }, await cookieFor("human_1", WS_A, "member"));
    const claude = r.data.aiRuntimeInventory.tools.find((t: any) => t.key === "claude");
    expect(claude.installed).toBe(false);
    // installMethods[0] is the recommended method; it matches the catalog's recommendedInstall.
    const rec = recommendedInstall(getRuntimeTool("claude")!, os);
    expect(claude.installMethods[0].command).toBe(rec!.command);
    expect(claude.installMethods[0].kind).toBe("recommended");
  });

  it("is denied without authentication", async () => {
    const r = await gql(INVENTORY_Q, { os: "linux" });
    expect(r.errors).toBeDefined();
    expect(r.data?.aiRuntimeInventory).toBeFalsy();
  });
});

const REPORTED_Q = `query{ reportedRuntimeInventories {
  runnerId runnerName reportedAt
  inventory { os nodeInstalled tools { key installed version } }
} }`;

function postReport(key: string, body: unknown) {
  return REPORT(
    new Request("http://test/api/runner/ai-tools", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}

describe("runner report endpoint + reportedRuntimeInventories", () => {
  const remoteInventory = {
    os: "macos",
    nodeInstalled: true,
    nodeVersion: "v22.1.0",
    nodeInstall: [],
    nodeDocsUrl: NODE_PREREQ.docsUrl,
    tools: [
      { key: "claude", installed: true, version: "1.2.3" },
      { key: "codex", installed: false, version: null },
    ],
  };

  it("persists a runner's posted inventory and reflects it in the query", async () => {
    const runnerId = await makeRunner(KEY);
    const res = await postReport(KEY, { inventory: remoteInventory, runnerName: "Build Box" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runnerId).toBe(runnerId);

    // A member in the same workspace sees the remote machine.
    const r = await gql(REPORTED_Q, {}, await cookieFor("human_1", WS_A, "member"));
    expect(r.errors).toBeFalsy();
    const rows = r.data.reportedRuntimeInventories;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runnerId, runnerName: "Build Box" });
    expect(rows[0].inventory.os).toBe("macos");
    const claude = rows[0].inventory.tools.find((t: any) => t.key === "claude");
    expect(claude).toMatchObject({ installed: true, version: "1.2.3" });
  });

  it("upserts - a second report replaces the first (latest per runner)", async () => {
    await makeRunner(KEY);
    await postReport(KEY, { inventory: remoteInventory });
    await postReport(KEY, {
      inventory: { ...remoteInventory, os: "linux" },
      runnerName: "Renamed",
    });
    const rows = await prisma.runnerToolInventory.findMany({ where: { workspaceId: WS_A } });
    expect(rows).toHaveLength(1);
    expect(rows[0].os).toBe("linux");
    expect(rows[0].runnerName).toBe("Renamed");
  });

  it("rejects an unauthenticated report", async () => {
    const res = await REPORT(
      new Request("http://test/api/runner/ai-tools", {
        method: "POST",
        body: JSON.stringify({ inventory: remoteInventory }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });

  it("is workspace-scoped: a runner's report is invisible to another workspace", async () => {
    await makeRunner(KEY, WS_A);
    await postReport(KEY, { inventory: remoteInventory });
    const r = await gql(REPORTED_Q, {}, await cookieFor("human_2", WS_B, "member"));
    expect(r.errors).toBeFalsy();
    expect(r.data.reportedRuntimeInventories).toHaveLength(0);
  });
});

describe("GET /api/ai-tools", () => {
  it("returns the control-plane host inventory as JSON", async () => {
    const res = await LOCAL_REST(new Request("http://test/api/ai-tools?os=linux"));
    const body = await res.json();
    expect(res.status).toBe(200);
    // successResponse wraps payload; the inventory has the catalog tool keys.
    const inv = body.data ?? body;
    expect(inv.os).toBe("linux");
    expect(inv.tools.map((t: any) => t.key)).toEqual(AI_RUNTIME_TOOLS.map((t) => t.key));
  });
});
