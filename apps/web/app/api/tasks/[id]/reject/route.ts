import { taskModel } from "@/server/models/task";
import { withAgent } from "../../../_lib/with-agent";
import { successResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, rejectTaskSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { assertProjectMember, squadLeadRequired } from "../../../_lib/project-access";
import { FLAG_KEYS } from "@agentcenter/utils";
import { performRejectTask } from "@/server/services/review";
import type { RouteContext } from "../../../_lib/route-context";

export const POST = withAgent(
  async (request, reviewer, ctx: RouteContext) => {
    const v = await validateBody(request, rejectTaskSchema);
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

    const result = await performRejectTask({
      reviewer,
      taskId,
      rejectionReason: body.rejectionReason,
      changesNeeded: body.changesNeeded as string[],
    });

    log(
      "task",
      `REJECTED agent="${reviewer.name}" task=#${task.taskNumber} reason="${body.rejectionReason}"`,
      request,
    );

    return successResponse({
      success: true,
      message: "Task rejected and moved back to assigned",
      newStatus: result.newStatus,
    });
  },
  {
    feature: { flag: FLAG_KEYS.REVIEWS, error: ERR.FEATURE_REVIEWS_UNAVAILABLE },
    blockOnShutdown: { error: "System is in shutdown mode. No task rejections allowed." },
  },
);
