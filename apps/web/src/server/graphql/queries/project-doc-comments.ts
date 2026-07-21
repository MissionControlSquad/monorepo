import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";

// Paperclip parity: review comments on a project doc. DOCUMENTS-gated.
builder.queryField("projectDocComments", (t) =>
  t.prismaField({
    type: ["ProjectDocComment"],
    args: { docId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      return ctx.prisma.projectDocComment.findMany({
        ...query,
        where: { docId: args.docId },
        orderBy: { createdAt: "asc" },
      });
    },
  }),
);
