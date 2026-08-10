import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { taskModel, documentModel, agentModel } from "../../models";
import { snapshotDocumentRevision } from "@/server/services/document-revisions";

builder.mutationField("createDocument", (t) =>
  t.prismaField({
    type: "Document",
    args: {
      title: t.arg.string({ required: true }),
      content: t.arg.string({ required: true }),
      type: t.arg.string({ required: true }),
      taskId: t.arg.string(),
      createdById: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      let projectId: string | undefined;
      let taskTitle: string | undefined;
      if (args.taskId) {
        const task = await taskModel.findById(args.taskId, {
          select: { title: true, projectId: true },
        });
        taskTitle = task?.title;
        projectId = task?.projectId ?? undefined;
      }

      const doc = await documentModel.create({
        ...query,
        data: {
          title: args.title,
          content: args.content,
          type: args.type as any,
          taskId: args.taskId ?? undefined,
          projectId,
          createdById: args.createdById,
        },
      });

      const creator = await agentModel.findById(args.createdById, {
        select: { name: true },
      });

      await documentModel.emitCreated(doc, {
        docType: args.type,
        taskId: args.taskId ?? undefined,
        taskTitle,
        createdBy: args.createdById,
        creatorName: creator?.name ?? "",
      });

      return doc;
    },
  }),
);

builder.mutationField("updateDocument", (t) =>
  t.prismaField({
    type: "Document",
    args: {
      id: t.arg.string({ required: true }),
      title: t.arg.string(),
      content: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      const doc = await documentModel.update(args.id, {
        ...query,
        data: {
          ...(args.title ? { title: args.title } : {}),
          ...(args.content ? { content: args.content } : {}),
        },
      });
      // Parity §3.12 — snapshot the committed version into the revision history (best-effort).
      await snapshotDocumentRevision({
        documentId: args.id,
        authorProfileId: ctx.session?.profileId ?? null,
      }).catch(() => {});
      return doc;
    },
  }),
);

builder.mutationField("deleteDocument", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      await documentModel.deleteById(args.id);
      return true;
    },
  }),
);
