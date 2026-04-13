import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { validateBody, approveTaskSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { assertProjectMember } from "../../../_lib/project-access";
import { isSystemShutdown } from "@/server/system-settings";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { Roles } from "@/server/constants";
import { taskModel } from "@/server/models/task";
import { parseChildTasks } from "@/server/sanitize";
import { assertAssignableAgents } from "@/server/assignment-guard";
import { performApproveTask } from "@/server/services/review";
import type { RouteContext } from "../../../_lib/route-context";

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const v = await validateBody(request, approveTaskSchema);
    if (v.error) return v.error;
    const body = v.data;
    const reviewer = await resolveAgent(request);
    const { id: taskId } = await ctx.params;

    if (!(await isFeatureEnabled(FLAG_KEYS.REVIEWS))) {
      return errorResponse("Reviews feature is not available on your current plan", 403);
    }
    if (await isSystemShutdown()) {
      return errorResponse("System is in shutdown mode. No task approvals allowed.", 503);
    }
    if (reviewer.role !== Roles.SQUAD_LEAD) {
      return errorResponse("Only Squad Lead can approve tasks", 403);
    }

    const task = await taskModel.findById(taskId, {
      select: { projectId: true, taskNumber: true },
    });
    if (!task) return errorResponse("Task not found", 404);
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
  } catch (err) {
    return handleError(err);
  }
}
