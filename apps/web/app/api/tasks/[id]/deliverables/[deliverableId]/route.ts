import { taskModel } from "@/server/models/task";
import { deliverableModel, deliverableVersionModel } from "@/server/models";
import { resolveAgent } from "../../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../../_lib/json-response";
import { ERR } from "../../../../_lib/error-messages";
import { validateBody, updateDeliverableSchema } from "../../../../_lib/validation";
import { log } from "../../../../_lib/logger";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { isSystemShutdown } from "@/server/system-settings";
import type { RouteContext as _RouteContext } from "../../../../_lib/route-context";
type RouteContext = _RouteContext<{ id: string; deliverableId: string }>;

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const { id: taskId, deliverableId } = await ctx.params;
    const v = await validateBody(request, updateDeliverableSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);

    if (await isSystemShutdown()) {
      return errorResponse("System is in shutdown mode. No deliverable revisions allowed.", 503);
    }

    const current = await deliverableModel.findById(deliverableId);
    if (!current) return errorResponse(ERR.DELIVERABLE_NOT_FOUND, 404);
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
  } catch (err) {
    return handleError(err);
  }
}
