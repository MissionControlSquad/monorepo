import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { requireRole } from "@/server/tenancy/guards";
import { FLAG_KEYS } from "@agentcenter/utils";
import { addExternalLink, removeExternalLink } from "@/server/services/external-links";

// Tier C: external object links writes. EXTERNAL_LINKS-gated.
builder.mutationField("addExternalLink", (t) =>
  t.prismaField({
    type: "ExternalLink",
    args: {
      taskId: t.arg.string({ required: true }),
      url: t.arg.string({ required: true }),
      title: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXTERNAL_LINKS);
      requireRole(ctx, "member");
      const link = await addExternalLink({
        taskId: args.taskId,
        url: args.url,
        title: args.title ?? null,
        createdByProfileId: ctx.session?.profileId ?? null,
      });
      return ctx.prisma.externalLink.findUniqueOrThrow({ ...query, where: { id: link.id } });
    },
  }),
);

builder.mutationField("removeExternalLink", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXTERNAL_LINKS);
      requireRole(ctx, "member");
      return removeExternalLink(args.id);
    },
  }),
);
