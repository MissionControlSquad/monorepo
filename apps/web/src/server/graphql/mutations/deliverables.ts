import { DeliverableKind } from "@agentcenter/database";
import { builder } from "../builder";
import { prisma } from "../../prisma";
import { taskModel, agentModel, deliverableModel } from "../../models";
import { getOrCreateAgentProfileId } from "../../agent-profile";

const VALID_KINDS = new Set<string>(Object.values(DeliverableKind));

function normalizeDeliverableKind(kind: string): DeliverableKind {
  if (VALID_KINDS.has(kind)) return kind as DeliverableKind;
  // Map common aliases to valid enum values
  if (kind === "document" || kind === "text") return DeliverableKind.markdown;
  if (kind === "url") return DeliverableKind.link;
  return DeliverableKind.markdown;
}

builder.mutationField("submitDeliverable", (t) =>
  t.prismaField({
    type: "Deliverable",
    args: {
      taskId: t.arg.string({ required: true }),
      agentId: t.arg.string({ required: true }),
      title: t.arg.string({ required: true }),
      kind: t.arg.string({ required: true }),
      content: t.arg.string(),
      language: t.arg.string(),
      storageKey: t.arg.string(),
      fileName: t.arg.string(),
      mimeType: t.arg.string(),
      fileSize: t.arg.int(),
      url: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const [task, agent, profileId] = await Promise.all([
        taskModel.findByIdSelect(args.taskId, {
          title: true,
          taskNumber: true,
          projectId: true,
        }),
        agentModel.findById(args.agentId, {
          select: { name: true },
        }),
        getOrCreateAgentProfileId(args.agentId),
      ]);

      const deliverable = await deliverableModel.create({
        ...query,
        data: {
          taskId: args.taskId,
          profileId,
          title: args.title,
          kind: normalizeDeliverableKind(args.kind),
          content: args.content ?? undefined,
          language: args.language ?? undefined,
          storageKey: args.storageKey ?? undefined,
          fileName: args.fileName ?? undefined,
          mimeType: args.mimeType ?? undefined,
          fileSize: args.fileSize ?? undefined,
          url: args.url ?? undefined,
          projectId: task?.projectId ?? undefined,
        },
      });

      await deliverableModel.emitSubmitted(deliverable, {
        taskNumber: task?.taskNumber,
        taskTitle: task?.title ?? "",
        agentName: agent?.name ?? "",
        agentId: args.agentId,
      });

      return deliverable;
    },
  }),
);

builder.mutationField("reviseDeliverable", (t) =>
  t.prismaField({
    type: "Deliverable",
    args: {
      id: t.arg.string({ required: true }),
      agentId: t.arg.string({ required: true }),
      title: t.arg.string(),
      content: t.arg.string(),
      language: t.arg.string(),
      storageKey: t.arg.string(),
      fileName: t.arg.string(),
      mimeType: t.arg.string(),
      fileSize: t.arg.int(),
      url: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const current = await deliverableModel.delegate.findUniqueOrThrow({
        where: { id: args.id },
      });

      const editedByProfileId = await getOrCreateAgentProfileId(args.agentId);

      // Snapshot + update in a single transaction to prevent version corruption
      const deliverable = await prisma.$transaction(async (tx) => {
        // Snapshot current state as a version
        await tx.deliverableVersion.create({
          data: {
            deliverableId: current.id,
            version: current.version,
            title: current.title,
            kind: current.kind,
            content: current.content ?? undefined,
            language: current.language ?? undefined,
            storageKey: current.storageKey ?? undefined,
            fileName: current.fileName ?? undefined,
            mimeType: current.mimeType ?? undefined,
            fileSize: current.fileSize ?? undefined,
            url: current.url ?? undefined,
            editedByProfileId,
          },
        });

        // Update deliverable in-place with incremented version
        return tx.deliverable.update({
          where: { id: args.id },
          ...query,
          data: {
            version: current.version + 1,
            ...(args.title ? { title: args.title } : {}),
            ...(args.content !== undefined ? { content: args.content } : {}),
            ...(args.language !== undefined ? { language: args.language } : {}),
            ...(args.storageKey !== undefined ? { storageKey: args.storageKey } : {}),
            ...(args.fileName !== undefined ? { fileName: args.fileName } : {}),
            ...(args.mimeType !== undefined ? { mimeType: args.mimeType } : {}),
            ...(args.fileSize !== undefined ? { fileSize: args.fileSize } : {}),
            ...(args.url !== undefined ? { url: args.url } : {}),
          },
        });
      });

      const [task, agent] = await Promise.all([
        taskModel.findByIdSelect(current.taskId, {
          title: true,
          taskNumber: true,
        }),
        agentModel.findById(args.agentId, {
          select: { name: true },
        }),
      ]);

      await deliverableModel.emitSubmitted(deliverable, {
        taskNumber: task?.taskNumber,
        taskTitle: task?.title ?? "",
        agentName: agent?.name ?? "",
        agentId: args.agentId,
        version: deliverable.version,
        isRevision: true,
      });

      return deliverable;
    },
  }),
);

builder.mutationField("deleteDeliverable", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args) => {
      await deliverableModel.deleteById(args.id);
      return true;
    },
  }),
);
