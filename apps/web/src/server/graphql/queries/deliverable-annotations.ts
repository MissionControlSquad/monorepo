import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";

// Tier C: deliverable annotations reads. ANNOTATIONS-gated.
builder.queryField("deliverableAnnotations", (t) =>
  t.prismaField({
    type: ["DeliverableAnnotation"],
    args: { deliverableId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ANNOTATIONS);
      return ctx.prisma.deliverableAnnotation.findMany({
        ...query,
        where: { deliverableId: args.deliverableId },
        orderBy: { createdAt: "asc" },
      });
    },
  }),
);
