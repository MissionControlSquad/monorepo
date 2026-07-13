import { taskModel } from "@/server/models/task";
import { deliverableModel } from "@/server/models";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { requireAgentCapability } from "@/server/services/agent-authz";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, createDeliverableSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { isSystemShutdown } from "@/server/system-settings";
import type { RouteContext } from "../../../_lib/route-context";

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const { id: taskId } = await ctx.params;
    await resolveAgent(request);

    const deliverables = await deliverableModel.findMany({
      where: { taskId },
      include: {
        profile: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(deliverables);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const { id: taskId } = await ctx.params;
    const v = await validateBody(request, createDeliverableSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);
    await requireAgentCapability(agent, "tasks.complete");

    if (await isSystemShutdown()) {
      return errorResponse("System is in shutdown mode. No deliverables can be submitted.", 503);
    }

    const { title, kind, content, language, storageKey, fileName, mimeType, fileSize, url } =
      v.data;

    const task = await taskModel.findByIdSelect(taskId, {
      title: true,
      taskNumber: true,
      projectId: true,
    });
    assertFound(task, ERR.TASK_NOT_FOUND);

    const profileId = await getOrCreateAgentProfileId(agent.id);
    const deliverable = await deliverableModel.create({
      data: {
        taskId,
        profileId,
        title,
        kind: kind as any,
        content: content ?? undefined,
        language: language ?? undefined,
        storageKey: storageKey ?? undefined,
        fileName: fileName ?? undefined,
        mimeType: mimeType ?? undefined,
        fileSize: fileSize ?? undefined,
        url: url ?? undefined,
        projectId: task?.projectId ?? undefined,
      },
    });

    await deliverableModel.emitSubmitted(deliverable, {
      taskNumber: task?.taskNumber,
      taskTitle: task?.title ?? "",
      agentName: agent.name,
      agentId: agent.id,
    });

    log(
      "deliverable",
      `SUBMITTED agent="${agent.name}" task=#${task.taskNumber} kind=${kind} "${title}"`,
      request,
    );
    return successResponse(deliverable, 201);
  } catch (err) {
    return handleError(err);
  }
}
