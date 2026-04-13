import { taskModel } from "@/server/models/task";
import { resolveAgent } from "../../../_lib/resolve-agent";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, rejectTaskSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { assertProjectMember, squadLeadRequired } from "../../../_lib/project-access";
import { isSystemShutdown } from "@/server/system-settings";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { performRejectTask } from "@/server/services/review";
import type { RouteContext } from "../../../_lib/route-context";

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const v = await validateBody(request, rejectTaskSchema);
    if (v.error) return v.error;
    const body = v.data;
    const reviewer = await resolveAgent(request);
    const { id: taskId } = await ctx.params;

    if (!(await isFeatureEnabled(FLAG_KEYS.REVIEWS))) {
      return errorResponse(ERR.FEATURE_REVIEWS_UNAVAILABLE, 403);
    }
    if (await isSystemShutdown()) {
      return errorResponse("System is in shutdown mode. No task rejections allowed.", 503);
    }
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
  } catch (err) {
    return handleError(err);
  }
}
