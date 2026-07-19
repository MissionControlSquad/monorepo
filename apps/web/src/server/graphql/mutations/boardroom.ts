import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { sendBoardMessage } from "@/server/services/boardroom";

// Epic #15: post a board-chat turn. admin only (operator surface); BOARD_CHAT-gated (off by default).
// Uses the default relay (LLM relay is a deferred runtime seam — spec D2); persists the assistant turn.
builder.mutationField("sendBoardMessage", (t) =>
  t.prismaField({
    type: "BoardMessage",
    args: { body: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BOARD_CHAT);
      const tenancy = requireRole(ctx, "admin");
      if (!args.body.trim()) {
        throw new Error("body is required");
      }
      const { assistantMessage } = await sendBoardMessage({
        workspaceId: tenancy.workspaceId,
        body: args.body,
        authorId: tenancy.userId,
      });
      // Return the assistant reply (the UI already has the user turn optimistically).
      return ctx.prisma.boardMessage.findUniqueOrThrow({
        ...query,
        where: { id: assistantMessage.id },
      });
    },
  }),
);
