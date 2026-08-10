import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { createBoardPrincipal, revokeBoardPrincipal } from "@/server/services/board-principals";

// Board principal mutations. admin-only (minting a board credential is privileged); BOARD_CHAT-gated.

// The create result carries the plaintext board key — the ONLY time it is ever returned.
const CreatedBoardPrincipal = builder.simpleObject("CreatedBoardPrincipal", {
  fields: (t) => ({
    id: t.string(),
    name: t.string(),
    role: t.string(),
    keyPrefix: t.string(),
    plainKey: t.string(),
  }),
});

builder.mutationField("createBoardPrincipal", (t) =>
  t.field({
    type: CreatedBoardPrincipal,
    args: {
      name: t.arg.string({ required: true }),
      role: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BOARD_CHAT);
      const tenancy = requireRole(ctx, "admin");
      const { principal, plainKey, keyPrefix } = await createBoardPrincipal({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        role: args.role ?? undefined,
        createdByProfileId: tenancy.userId,
      });
      return { id: principal.id, name: principal.name, role: principal.role, keyPrefix, plainKey };
    },
  }),
);

builder.mutationField("revokeBoardPrincipal", (t) =>
  t.prismaField({
    type: "BoardPrincipal",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BOARD_CHAT);
      const tenancy = requireRole(ctx, "admin");
      const revoked = await revokeBoardPrincipal(tenancy.workspaceId, args.id);
      return ctx.prisma.boardPrincipal.findUniqueOrThrow({ ...query, where: { id: revoked.id } });
    },
  }),
);
