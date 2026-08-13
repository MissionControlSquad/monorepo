import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

// Tier D: list runner commands (raw shell/CLI jobs). RUNNERS-gated, member+.
builder.queryField("runnerCommands", (t) =>
  t.prismaField({
    type: ["RunnerCommand"],
    args: {
      targetKind: t.arg.string(),
      targetId: t.arg.string(),
      limit: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.runnerCommand.findMany({
        ...query,
        where: {
          workspaceId: tenancy.workspaceId,
          ...(args.targetKind ? { targetKind: args.targetKind as never } : {}),
          ...(args.targetId ? { targetId: args.targetId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 50, 200),
      });
    },
  }),
);
