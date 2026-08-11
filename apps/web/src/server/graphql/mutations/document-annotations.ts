import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { isFeatureEnabled } from "@/server/feature-flags";
import { requireRole } from "@/server/tenancy";
import {
  createAnnotationThread,
  addAnnotationComment,
  resolveAnnotationThread,
  acquireDocumentLock,
  releaseDocumentLock,
} from "@/server/services/document-annotations";

const LockState = builder.simpleObject("DocumentLockState", {
  fields: (t) => ({
    acquired: t.boolean(),
    heldByProfileId: t.string({ nullable: true }),
    expiresAt: t.field({ type: "DateTime", nullable: true }),
  }),
});
builder.mutationField("createAnnotationThread", (t) =>
  t.prismaField({
    type: "DocumentAnnotationThread",
    args: {
      documentId: t.arg.string({ required: true }),
      startOffset: t.arg.int({ required: true }),
      endOffset: t.arg.int({ required: true }),
    },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      const tn = requireRole(ctx, "member");
      return createAnnotationThread({
        documentId: args.documentId,
        startOffset: args.startOffset,
        endOffset: args.endOffset,
        authorProfileId: tn.userId,
      });
    },
  }),
);
builder.mutationField("addAnnotationComment", (t) =>
  t.prismaField({
    type: "DocumentAnnotationComment",
    args: { threadId: t.arg.string({ required: true }), body: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      const tn = requireRole(ctx, "member");
      // Work-items §3 Item 1 — mirror into the task timeline only when ANNOTATIONS is enabled.
      const mirrorToTask = await isFeatureEnabled(FLAG_KEYS.ANNOTATIONS);
      return addAnnotationComment({
        threadId: args.threadId,
        body: args.body,
        authorProfileId: tn.userId,
        mirrorToTask,
      });
    },
  }),
);
builder.mutationField("resolveAnnotationThread", (t) =>
  t.field({
    type: "Boolean",
    args: { threadId: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      requireRole(ctx, "member");
      return resolveAnnotationThread(args.threadId);
    },
  }),
);
builder.mutationField("acquireDocumentLock", (t) =>
  t.field({
    type: LockState,
    args: { documentId: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      const tn = requireRole(ctx, "member");
      return acquireDocumentLock(args.documentId, tn.userId);
    },
  }),
);
builder.mutationField("releaseDocumentLock", (t) =>
  t.field({
    type: "Boolean",
    args: { documentId: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      const tn = requireRole(ctx, "member");
      return releaseDocumentLock(args.documentId, tn.userId);
    },
  }),
);
