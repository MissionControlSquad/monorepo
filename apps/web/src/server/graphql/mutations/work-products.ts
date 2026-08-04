import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  createWorkProduct,
  setWorkProductReviewState,
  setWorkProductStatus,
} from "@/server/services/work-products";

// Domain 8 G1: work-product mutations. Create is member+ (a human records an output); the review
// gate (approve / request-changes) is admin — a board reviewer, never the producing agent. Status
// transitions are member+. All WORK_PRODUCTS-gated.

builder.mutationField("createWorkProduct", (t) =>
  t.prismaField({
    type: "Deliverable",
    args: {
      taskId: t.arg.string({ required: true }),
      kind: t.arg.string({ required: true }),
      title: t.arg.string({ required: true }),
      url: t.arg.string(),
      provider: t.arg.string(),
      externalId: t.arg.string(),
      createdByRunId: t.arg.string(),
      makePrimary: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.WORK_PRODUCTS);
      const tenancy = requireRole(ctx, "member");
      // Author profile = the caller's profile (the human recording the output).
      const wp = await createWorkProduct({
        taskId: args.taskId,
        profileId: tenancy.userId,
        kind: args.kind,
        title: args.title,
        url: args.url ?? null,
        provider: args.provider ?? null,
        externalId: args.externalId ?? null,
        createdByRunId: args.createdByRunId ?? null,
        makePrimary: args.makePrimary ?? true,
      });
      return ctx.prisma.deliverable.findUniqueOrThrow({ ...query, where: { id: wp.id } });
    },
  }),
);

builder.mutationField("setWorkProductReviewState", (t) =>
  t.prismaField({
    type: "Deliverable",
    args: {
      deliverableId: t.arg.string({ required: true }),
      reviewState: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.WORK_PRODUCTS);
      const tenancy = requireRole(ctx, "admin"); // board reviewer only — no agent self-approval
      const wp = await setWorkProductReviewState({
        deliverableId: args.deliverableId,
        reviewState: args.reviewState,
        reviewedByProfileId: tenancy.userId,
      });
      return ctx.prisma.deliverable.findUniqueOrThrow({ ...query, where: { id: wp.id } });
    },
  }),
);

builder.mutationField("setWorkProductStatus", (t) =>
  t.prismaField({
    type: "Deliverable",
    args: {
      deliverableId: t.arg.string({ required: true }),
      status: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.WORK_PRODUCTS);
      requireRole(ctx, "member");
      const wp = await setWorkProductStatus(args.deliverableId, args.status);
      return ctx.prisma.deliverable.findUniqueOrThrow({ ...query, where: { id: wp.id } });
    },
  }),
);
