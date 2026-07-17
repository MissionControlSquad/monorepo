import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";

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
      const tenancy = requireRole(ctx, "member");
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
