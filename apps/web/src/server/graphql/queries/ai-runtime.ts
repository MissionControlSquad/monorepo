import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { detectLocalRuntimes, type RuntimeInventory } from "@/server/services/ai-runtime-detect";
import { listReportedInventories, coerceOs } from "@/server/services/ai-runtime-inventory";

// AI Tools setup/doctor reads. AI_TOOLS-gated, member+. The inventory is COMPUTED (probe the host with
// the pure catalog), so these are plain simpleObjects, not Prisma objects. detectLocalRuntimes uses
// node:child_process - the /api/graphql route already runs on the Node runtime (no edge export), so
// this is safe there. A REMOTE machine's inventory is whatever its runner last reported (stored JSON).

const AiInstallMethod = builder.simpleObject("AiInstallMethod", {
  fields: (t) => ({
    os: t.string(), // "macos" | "linux" | "windows" | "any"
    label: t.string(),
    command: t.string(),
    kind: t.string(), // "recommended" | "alternative"
    note: t.string({ nullable: true }),
    needs: t.string({ nullable: true }), // e.g. "node"
  }),
});

const AiRuntimeTool = builder.simpleObject("AiRuntimeTool", {
  fields: (t) => ({
    key: t.string(),
    displayName: t.string(),
    binName: t.string(),
    summary: t.string(),
    docsUrl: t.string(),
    installed: t.boolean(),
    version: t.string({ nullable: true }),
    needsNode: t.boolean(),
    installMethods: t.field({ type: [AiInstallMethod] }),
  }),
});

const AiRuntimeInventory = builder.simpleObject("AiRuntimeInventory", {
  fields: (t) => ({
    os: t.string(),
    nodeInstalled: t.boolean(),
    nodeVersion: t.string({ nullable: true }),
    nodeDocsUrl: t.string(),
    nodeInstall: t.field({ type: [AiInstallMethod] }),
    tools: t.field({ type: [AiRuntimeTool] }),
  }),
});

const AiReportedInventory = builder.simpleObject("AiReportedInventory", {
  fields: (t) => ({
    runnerId: t.string(),
    runnerName: t.string({ nullable: true }),
    reportedAt: t.string(),
    inventory: t.field({ type: AiRuntimeInventory }),
  }),
});

// LOCAL (control-plane host) inventory. `os` override lets the UI preview another OS's install commands
// without changing what is detected as installed (detection is always the real host).
builder.queryField("aiRuntimeInventory", (t) =>
  t.field({
    type: AiRuntimeInventory,
    args: { os: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AI_TOOLS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const os = coerceOs(args.os);
      return detectLocalRuntimes(os ?? undefined);
    },
  }),
);

// REMOTE machines: the latest inventory each runner reported about its own host, workspace-scoped.
builder.queryField("reportedRuntimeInventories", (t) =>
  t.field({
    type: [AiReportedInventory],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.AI_TOOLS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const rows = await listReportedInventories(tenancy.workspaceId);
      return rows.map((r) => ({
        runnerId: r.runnerId,
        runnerName: r.runnerName,
        reportedAt: r.reportedAt.toISOString(),
        inventory: r.payload as unknown as RuntimeInventory,
      }));
    },
  }),
);
