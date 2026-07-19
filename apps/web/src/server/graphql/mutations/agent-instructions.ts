import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  upsertInstruction,
  deleteInstruction,
  seedDefaultInstructions,
} from "@/server/services/agent-instructions";

// Epic #18: agent instruction mutations. member (configuring an agent is authoring, not privileged);
// AGENT_INSTRUCTIONS-gated. Workspace-scoped via the agent.
builder.mutationField("upsertAgentInstruction", (t) =>
  t.prismaField({
    type: "AgentInstruction",
    args: {
      agentId: t.arg.string({ required: true }),
      fileName: t.arg.string({ required: true }),
      content: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_INSTRUCTIONS);
      const tenancy = requireRole(ctx, "member");
      const row = await upsertInstruction({
        workspaceId: tenancy.workspaceId,
        agentId: args.agentId,
        fileName: args.fileName,
        content: args.content,
        updatedByProfileId: tenancy.userId,
      });
      return ctx.prisma.agentInstruction.findUniqueOrThrow({ ...query, where: { id: row.id } });
    },
  }),
);

builder.mutationField("deleteAgentInstruction", (t) =>
  t.field({
    type: "Boolean",
    args: {
      agentId: t.arg.string({ required: true }),
      fileName: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_INSTRUCTIONS);
      const tenancy = requireRole(ctx, "member");
      return deleteInstruction(tenancy.workspaceId, args.agentId, args.fileName);
    },
  }),
);

builder.mutationField("seedAgentInstructions", (t) =>
  t.prismaField({
    type: ["AgentInstruction"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_INSTRUCTIONS);
      const tenancy = requireRole(ctx, "member");
      const rows = await seedDefaultInstructions(tenancy.workspaceId, args.agentId, tenancy.userId);
      const ids = rows.map((r) => r.id);
      return ctx.prisma.agentInstruction.findMany({
        ...query,
        where: { id: { in: ids } },
        orderBy: { fileName: "asc" },
      });
    },
  }),
);
