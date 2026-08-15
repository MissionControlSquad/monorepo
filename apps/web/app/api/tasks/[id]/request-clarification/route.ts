import { taskModel } from "@/server/models/task";
import { withAgent } from "../../../_lib/with-agent";
import { successResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, requestClarificationSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { assertProjectMember, squadLeadRequired } from "../../../_lib/project-access";
import { FLAG_KEYS, AGENT_CAPABILITY } from "@agentcenter/utils";
import { performRequestClarification } from "@/server/services/review";
import type { RouteContext } from "../../../_lib/route-context";

export const POST = withAgent(
  async (request, reviewer, ctx: RouteContext) => {
    const v = await validateBody(request, requestClarificationSchema);
    if (v.error) return v.error;
    const body = v.data;
    const { id: taskId } = await ctx.params;

    const guard = squadLeadRequired(reviewer);
    if (guard) return guard;

    const task = await taskModel.findById(taskId, {
      select: { projectId: true, taskNumber: true },
    });
    assertFound(task, ERR.TASK_NOT_FOUND);
    if (task.projectId) await assertProjectMember(reviewer.id, task.projectId);

    const result = await performRequestClarification({
      reviewer,
      taskId,
      questions: body.questions as string[],
    });

    log(
      "task",
      `CLARIFICATION agent="${reviewer.name}" task=#${task.taskNumber} questions=${(body.questions as string[]).length}`,
      request,
    );

    return successResponse({
      success: true,
      message: "Clarification requested",
      newStatus: result.newStatus,
    });
  },
  // Requesting clarification is an agent communication action (parity #9/#10).
  {
    feature: { flag: FLAG_KEYS.REVIEWS, error: ERR.FEATURE_REVIEWS_UNAVAILABLE },
    blockOnShutdown: { error: "System is in shutdown mode. No clarification requests allowed." },
    capability: AGENT_CAPABILITY.MESSAGES_SEND,
  },
);
