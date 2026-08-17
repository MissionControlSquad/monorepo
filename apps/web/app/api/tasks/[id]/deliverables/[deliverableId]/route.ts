import { taskModel } from "@/server/models/task";
import { deliverableModel, deliverableVersionModel } from "@/server/models";
import { withAgent } from "../../../../_lib/with-agent";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import { successResponse, errorResponse, assertFound } from "../../../../_lib/json-response";
import { ERR } from "../../../../_lib/error-messages";
import { validateBody, updateDeliverableSchema } from "../../../../_lib/validation";
import { log } from "../../../../_lib/logger";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import type { RouteContext as _RouteContext } from "../../../../_lib/route-context";
type RouteContext = _RouteContext<{ id: string; deliverableId: string }>;

export const PATCH = withAgent(
  async (request, agent, ctx: RouteContext) => {
    const { id: taskId, deliverableId } = await ctx.params;
    const v = await validateBody(request, updateDeliverableSchema);
    if (v.error) return v.error;

    const current = await deliverableModel.findById(deliverableId);
    assertFound(current, ERR.DELIVERABLE_NOT_FOUND);
    if (current.taskId !== taskId)
      return errorResponse("Deliverable does not belong to this task", 400);
    const profileId = await getOrCreateAgentProfileId(agent.id);
    if (current.profileId !== profileId) return errorResponse(ERR.NOT_YOUR_DELIVERABLE, 403);

    const { title, content, language, storageKey, fileName, mimeType, fileSize, url } = v.data;

    // Snapshot current state as a version
    await deliverableVersionModel.create({
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
        editedByProfileId: profileId,
      },
    });

    // Update deliverable in-place with incremented version
    const deliverable = await deliverableModel.update(deliverableId, {
      data: {
        version: current.version + 1,
        ...(title ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(language !== undefined ? { language } : {}),
        ...(storageKey !== undefined ? { storageKey } : {}),
        ...(fileName !== undefined ? { fileName } : {}),
        ...(mimeType !== undefined ? { mimeType } : {}),
        ...(fileSize !== undefined ? { fileSize } : {}),
        ...(url !== undefined ? { url } : {}),
      },
    });

    const task = await taskModel.findByIdSelect(taskId, {
      title: true,
      taskNumber: true,
    });

    await deliverableModel.emitSubmitted(deliverable, {
      taskNumber: task?.taskNumber,
      taskTitle: task?.title ?? "",
      agentName: agent.name,
      agentId: agent.id,
      version: deliverable.version,
      isRevision: true,
    });

    log(
      "deliverable",
      `REVISED agent="${agent.name}" task=#${task?.taskNumber} v${current.version}→v${deliverable.version}`,
      request,
    );
    return successResponse(deliverable);
  },
  // Enforce the same capability as submitting a deliverable — revising is a deliverable write
  // (parity #9/#10: the sibling POST checks TASKS_COMPLETE; this PATCH previously did not).
  {
    capability: AGENT_CAPABILITY.TASKS_COMPLETE,
    blockOnShutdown: { error: "System is in shutdown mode. No deliverable revisions allowed." },
  },
);
