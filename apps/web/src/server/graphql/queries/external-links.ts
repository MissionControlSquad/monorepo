import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";

// Tier C: external object links reads. EXTERNAL_LINKS-gated.
builder.queryField("taskExternalLinks", (t) =>
  t.prismaField({
    type: ["ExternalLink"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXTERNAL_LINKS);
      return ctx.prisma.externalLink.findMany({
        ...query,
        where: { taskId: args.taskId },
        orderBy: { createdAt: "asc" },
      });
    },
  }),
);
