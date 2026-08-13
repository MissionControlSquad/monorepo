import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { requireRole } from "@/server/tenancy/guards";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  addDeliverableAnnotation,
  setAnnotationResolved,
  deleteDeliverableAnnotation,
} from "@/server/services/deliverable-annotations";

// Tier C: deliverable annotations writes. ANNOTATIONS-gated.
builder.mutationField("addDeliverableAnnotation", (t) =>
  t.prismaField({
    type: "DeliverableAnnotation",
    args: {
      deliverableId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
      quote: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ANNOTATIONS);
      requireRole(ctx, "member");
      const a = await addDeliverableAnnotation({
        deliverableId: args.deliverableId,
        body: args.body,
        quote: args.quote ?? null,
        createdByProfileId: ctx.session?.profileId ?? null,
      });
      return ctx.prisma.deliverableAnnotation.findUniqueOrThrow({ ...query, where: { id: a.id } });
    },
  }),
);

builder.mutationField("resolveDeliverableAnnotation", (t) =>
  t.prismaField({
    type: "DeliverableAnnotation",
    args: {
      id: t.arg.string({ required: true }),
      resolved: t.arg.boolean({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ANNOTATIONS);
      requireRole(ctx, "member");
      const a = await setAnnotationResolved(args.id, args.resolved);
      return ctx.prisma.deliverableAnnotation.findUniqueOrThrow({ ...query, where: { id: a.id } });
    },
  }),
);

builder.mutationField("deleteDeliverableAnnotation", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ANNOTATIONS);
      requireRole(ctx, "member");
      return deleteDeliverableAnnotation(args.id);
    },
  }),
);
