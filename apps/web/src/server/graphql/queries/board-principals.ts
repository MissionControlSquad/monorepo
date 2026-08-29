import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

// Board principals list. BOARD_CHAT-gated (off by default), admin-only (managing board identities is
// privileged). Workspace-scoped server-side.
builder.queryField("boardPrincipals", (t) =>
  t.prismaField({
    type: ["BoardPrincipal"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.BOARD_CHAT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return ctx.prisma.boardPrincipal.findMany({
        ...query,
        where: { workspaceId: tenancy.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
