import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

// Epic #9: terminal sessions read — TERMINALS-gated (off by default), admin, workspace-scoped.
// connectTokenHash is not a schema field, so it can never be selected here.
builder.queryField("terminalSessions", (t) =>
  t.prismaField({
    type: ["TerminalSession"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.TERMINALS);
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return ctx.prisma.terminalSession.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
