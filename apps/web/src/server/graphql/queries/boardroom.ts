import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { getOrCreateBoardThread } from "@/server/services/boardroom";

// Epic #15: boardroom read. BOARD_CHAT-gated (off by default), admin (operator surface).
builder.queryField("boardThread", (t) =>
  t.prismaField({
    type: "BoardThread",
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.BOARD_CHAT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const thread = await getOrCreateBoardThread(tenancy.workspaceId);
      return ctx.prisma.boardThread.findUniqueOrThrow({ ...query, where: { id: thread.id } });
    },
  }),
);
