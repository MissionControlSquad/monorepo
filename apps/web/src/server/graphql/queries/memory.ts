import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { getCompanyDefaultMemoryProvider } from "@/server/services/agent-memory";

// Tier D / Domain 4: memory read surfaces (inspect). All MEMORY-gated, member+, workspace-scoped.

// The operations audit log — filterable by agent / task / op type. Newest first.
builder.queryField("memoryOperations", (t) =>
  t.prismaField({
    type: ["MemoryOperation"],
    args: {
      agentId: t.arg.string(),
      taskId: t.arg.string(),
      opType: t.arg.string(),
      limit: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MEMORY);
      const tenancy = requireRole(ctx, "member");
      return ctx.prisma.memoryOperation.findMany({
        ...query,
        where: {
          workspaceId: tenancy.workspaceId,
          ...(args.agentId ? { agentId: args.agentId } : {}),
          ...(args.taskId ? { taskId: args.taskId } : {}),
          ...(args.opType ? { opType: args.opType } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 50, 200),
      });
    },
  }),
);

// The db-provider's stored entries for an agent (newest first) — record list for the inspect UI.
builder.queryField("agentMemoryEntries", (t) =>
  t.prismaField({
    type: ["AgentMemory"],
    args: {
      agentId: t.arg.string({ required: true }),
      limit: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MEMORY);
      const tenancy = requireRole(ctx, "member");
      return ctx.prisma.agentMemory.findMany({
        ...query,
        where: { workspaceId: tenancy.workspaceId, agentId: args.agentId },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 50, 200),
      });
    },
  }),
);

// The company-wide default memory provider (GAP-C) — "none" when unset.
builder.queryField("companyMemoryDefault", (t) =>
  t.string({
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.MEMORY);
      const tenancy = requireRole(ctx, "member");
      return getCompanyDefaultMemoryProvider(tenancy.workspaceId);
    },
  }),
);
