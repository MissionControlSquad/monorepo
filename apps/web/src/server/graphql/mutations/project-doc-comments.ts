import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  addProjectDocComment,
  setProjectDocCommentResolved,
  deleteProjectDocComment,
} from "@/server/services/project-doc-comments";

// Paperclip parity: add/resolve/delete review comments on a project doc. DOCUMENTS-gated, member+.
builder.mutationField("addProjectDocComment", (t) =>
  t.prismaField({
    type: "ProjectDocComment",
    args: {
      docId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
      quote: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const created = await addProjectDocComment({
        docId: args.docId,
        body: args.body,
        quote: args.quote ?? null,
        authorProfileId: tenancy.userId,
      });
      return ctx.prisma.projectDocComment.findUniqueOrThrow({
        ...query,
        where: { id: created.id },
      });
    },
  }),
);

builder.mutationField("resolveProjectDocComment", (t) =>
  t.prismaField({
    type: "ProjectDocComment",
    args: { id: t.arg.string({ required: true }), resolved: t.arg.boolean({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      await setProjectDocCommentResolved(args.id, args.resolved);
      return ctx.prisma.projectDocComment.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

builder.mutationField("deleteProjectDocComment", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return deleteProjectDocComment(args.id);
    },
  }),
);
