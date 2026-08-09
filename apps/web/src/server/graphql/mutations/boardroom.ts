import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { sendBoardMessage, setBoardMessageFeedback } from "@/server/services/boardroom";

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

// Epic #15: rate an assistant board turn (thumbs up/down + optional reason). member — the operator
// reviewing answers. BOARD_CHAT-gated.
builder.mutationField("setBoardMessageFeedback", (t) =>
  t.prismaField({
    type: "BoardMessage",
    args: {
      messageId: t.arg.string({ required: true }),
      score: t.arg.int({ required: true }),
      reason: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BOARD_CHAT);
      const tenancy = requireRole(ctx, "member");
      const message = await setBoardMessageFeedback({
        workspaceId: tenancy.workspaceId,
        messageId: args.messageId,
        score: args.score,
        reason: args.reason ?? null,
      });
      return ctx.prisma.boardMessage.findUniqueOrThrow({ ...query, where: { id: message.id } });
    },
  }),
);
