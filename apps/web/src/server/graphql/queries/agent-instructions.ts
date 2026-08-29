import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listInstructions } from "@/server/services/agent-instructions";

// Epic #18: agent instruction bundle read — AGENT_INSTRUCTIONS-gated, member, workspace-scoped via agent.
builder.queryField("agentInstructions", (t) =>
  t.prismaField({
    type: ["AgentInstruction"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_INSTRUCTIONS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const list = await listInstructions(tenancy.workspaceId, args.agentId);
      const ids = list.map((i) => i.id);
      return ctx.prisma.agentInstruction.findMany({
        ...query,
        where: { id: { in: ids } },
        orderBy: { fileName: "asc" },
      });
    },
  }),
);
