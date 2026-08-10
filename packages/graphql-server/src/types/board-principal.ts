import { builder } from "../builder";

// Board principal (Paperclip board-authz + board API keys). A first-class board identity that can act
// in the boardroom. The board API key is NEVER exposed as a field — only its display `keyPrefix` (the
// plaintext key is returned once, from createBoardPrincipal). BOARD_CHAT-gated at the resolver edge.
builder.prismaObject("BoardPrincipal", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    role: t.exposeString("role"),
    createdByProfileId: t.exposeString("createdByProfileId", { nullable: true }),
    revokedAt: t.expose("revokedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    // Display-only prefix of the linked board API key (never the secret).
    keyPrefix: t.string({
      nullable: true,
      resolve: async (principal, _args, ctx) => {
        const key = await ctx.prisma.apiKey.findUnique({
          where: { id: principal.apiKeyId },
          select: { keyPrefix: true },
        });
        return key?.keyPrefix ?? null;
      },
    }),
  }),
});
