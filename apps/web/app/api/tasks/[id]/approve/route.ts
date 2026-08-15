import { withAgent } from "../../../_lib/with-agent";
import { successResponse, errorResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, approveTaskSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { assertProjectMember, squadLeadRequired } from "../../../_lib/project-access";
import { FLAG_KEYS } from "@agentcenter/utils";
import { taskModel } from "@/server/models/task";
import { parseChildTasks } from "@/server/sanitize";
import { assertAssignableAgents } from "@/server/assignment-guard";
import { performApproveTask } from "@/server/services/review";
import type { RouteContext } from "../../../_lib/route-context";

export const POST = withAgent(
  async (request, reviewer, ctx: RouteContext) => {
    const v = await validateBody(request, approveTaskSchema);
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

    let childTasks;
    if (body.childTasks) {
      try {
        childTasks = parseChildTasks(body.childTasks);
      } catch (e: any) {
        return errorResponse(e.message, 400);
      }
      for (const child of childTasks) {
        if (child.assigneeIds?.length) {
          try {
            await assertAssignableAgents(child.assigneeIds);
          } catch (e: any) {
            return errorResponse(e.message, 400);
          }
        }
      }
    }

    const result = await performApproveTask({
      reviewer,
      taskId,
      approvalComment: body.approvalComment,
      childTasks,
    });

    log(
      "task",
      `APPROVED agent="${reviewer.name}" task=#${task.taskNumber} childTasks=${result.childTaskIds?.length ?? 0}`,
      request,
    );

    return successResponse({
      success: true,
      message: "Task approved and moved to done",
      newStatus: result.newStatus,
      childTaskIds: result.childTaskIds,
    });
  },
  {
    feature: { flag: FLAG_KEYS.REVIEWS, error: ERR.FEATURE_REVIEWS_UNAVAILABLE },
    blockOnShutdown: { error: "System is in shutdown mode. No task approvals allowed." },
  },
);
