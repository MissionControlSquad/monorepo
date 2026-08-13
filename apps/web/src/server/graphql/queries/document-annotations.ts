import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listAnnotationThreads } from "@/server/services/document-annotations";
builder.queryField("annotationThreads", (t) =>
  t.prismaField({
    type: ["DocumentAnnotationThread"],
    args: { documentId: t.arg.string({ required: true }), includeResolved: t.arg.boolean() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listAnnotationThreads(args.documentId, {
        includeResolved: args.includeResolved ?? undefined,
      });
    },
  }),
);
