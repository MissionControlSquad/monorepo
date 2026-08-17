import { taskModel } from "@/server/models/task";
import { deliverableModel } from "@/server/models";
import { withAgent } from "../../../_lib/with-agent";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import { successResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, createDeliverableSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import type { RouteContext } from "../../../_lib/route-context";

export const GET = withAgent(async (_request, _agent, ctx: RouteContext) => {
  const { id: taskId } = await ctx.params;

  const deliverables = await deliverableModel.findMany({
    where: { taskId },
    include: {
      profile: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return successResponse(deliverables);
});

export const POST = withAgent(
  async (request, agent, ctx: RouteContext) => {
    const { id: taskId } = await ctx.params;
    const v = await validateBody(request, createDeliverableSchema);
    if (v.error) return v.error;

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
  },
  {
    capability: AGENT_CAPABILITY.TASKS_COMPLETE,
    blockOnShutdown: { error: "System is in shutdown mode. No deliverables can be submitted." },
  },
);
