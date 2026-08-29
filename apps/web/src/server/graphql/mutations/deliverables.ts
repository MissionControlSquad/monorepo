import { DeliverableKind } from "@agentcenter/database";
import { builder } from "../builder";
import { requireRole } from "@/server/tenancy/guards";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
// reviseDeliverable mutation retired — deliverable revision is agent-facing via the REST PATCH
// /api/tasks/[id]/deliverables/[deliverableId] path (same snapshot+version-increment). The GraphQL
// mutation was unwired (no client op, no caller) and duplicated that logic.
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
    resolve: async (query, _root, args, ctx) => {
      // Human write gate (docs/RBAC.md §D): viewer read-only; member+ / API-key agents may submit.
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
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

builder.mutationField("deleteDeliverable", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      await deliverableModel.deleteById(args.id);
      return true;
    },
  }),
);
