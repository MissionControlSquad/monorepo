import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { getRunRuntimeStatus } from "@/server/services/run-runtime-status";
import { readRunLog } from "@/server/services/run-log-store";

// Tier D: the run ledger — list agent executions (sandbox/runner). RUNNERS-gated, member+.
builder.queryField("agentRuns", (t) =>
  t.prismaField({
    type: ["AgentRun"],
    args: {
      taskId: t.arg.string(),
      agentId: t.arg.string(),
      limit: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.agentRun.findMany({
        ...query,
        where: {
          workspaceId: tenancy.workspaceId,
          ...(args.taskId ? { taskId: args.taskId } : {}),
          ...(args.agentId ? { agentId: args.agentId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 50, 200),
      });
    },
  }),
);

// Live run status (Plan 6): the redacted, in-memory tail + phase of a run mid-flight (poll target).
// Returns null when nothing is tracked (never started, or the 90s TTL evicted it). RUNNERS-gated,
// member+, workspace-scoped (the run must belong to the caller's workspace).
const AgentRunLiveStatusType = builder.simpleObject("AgentRunLiveStatus", {
  fields: (t) => ({
    phase: t.string(),
    tail: t.string(),
  }),
});

builder.queryField("agentRunLiveStatus", (t) =>
  t.field({
    type: AgentRunLiveStatusType,
    nullable: true,
    args: { runId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const run = await ctx.prisma.agentRun.findFirst({
        where: { id: args.runId, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!run) return null; // not this workspace's run → no leak
      return getRunRuntimeStatus(args.runId);
    },
  }),
);

// Per-run log store (observability): the FULL, durable (redacted) stdout/stderr transcript persisted in
// chunks, range-readable by byte offset. Unlike agentRunLiveStatus (ephemeral in-mem tail), this is the
// persisted ledger a Run-history view fetches after the fact. RUNNERS-gated, member+, workspace-scoped
// (the run must belong to the caller's workspace - a foreign run returns null, no existence leak).
const RunLogType = builder.simpleObject("RunLog", {
  fields: (t) => ({
    content: t.string(),
    offset: t.int(),
    totalBytes: t.int(),
    nextOffset: t.int({ nullable: true }),
    sha256: t.string({ nullable: true }),
    finalized: t.boolean(),
  }),
});

builder.queryField("runLog", (t) =>
  t.field({
    type: RunLogType,
    nullable: true,
    args: {
      runId: t.arg.string({ required: true }),
      offset: t.arg.int(),
      limit: t.arg.int(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const run = await ctx.prisma.agentRun.findFirst({
        where: { id: args.runId, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!run) return null; // not this workspace's run → no leak
      const result = await readRunLog(args.runId, {
        offset: args.offset ?? undefined,
        limit: args.limit ?? undefined,
      });
      return result;
    },
  }),
);
