import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";

// Tool access-policy reads (parity #21). The Agent Detail "Tools" tab shows an agent's effective tool
// access: the workspace-wide rules (agentId null) plus the rules that name this agent, ordered agent-
// scoped first then by priority - the same precedence the pure evaluator applies. Member-read,
// workspace-scoped: a foreign agentId only ever narrows agent-scoped rows inside the caller's own
// workspace, so nothing leaks across the tenancy boundary.
builder.queryField("agentToolAccessPolicies", (t) =>
  t.prismaField({
    type: ["ToolAccessPolicy"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const tenancy = requireRole(ctx, "member");
      // Confirm the agent belongs to this workspace before surfacing its rules.
      const agent = await ctx.prisma.agent.findFirst({
        where: { id: args.agentId, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!agent) return [];
      return ctx.prisma.toolAccessPolicy.findMany({
        ...query,
        where: {
          workspaceId: tenancy.workspaceId,
          OR: [{ agentId: null }, { agentId: args.agentId }],
        },
        // Agent-scoped rules first (agentId not null sorts after null asc, so desc puts them first),
        // then higher priority, then newest - mirrors the evaluator's scope > priority ordering.
        orderBy: [{ agentId: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
      });
    },
  }),
);
