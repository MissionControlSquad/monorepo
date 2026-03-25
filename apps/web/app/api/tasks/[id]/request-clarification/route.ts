import { Roles } from "@/server/constants";
import { taskModel } from "@/server/models/task";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { validateBody, requestClarificationSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { assertProjectMember } from "../../../_lib/project-access";
import { isSystemShutdown } from "@/server/system-settings";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { performRequestClarification } from "@/server/services/review";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const v = await validateBody(request, requestClarificationSchema);
    if (v.error) return v.error;
    const body = v.data;
    const reviewer = await resolveAgent(request);
    const { id: taskId } = await ctx.params;

    if (!(await isFeatureEnabled(FLAG_KEYS.REVIEWS))) {
      return errorResponse("Reviews feature is not available on your current plan", 403);
    }
    if (await isSystemShutdown()) {
      return errorResponse("System is in shutdown mode. No clarification requests allowed.", 503);
    }
    if (reviewer.role !== Roles.SQUAD_LEAD) {
      return errorResponse("Only Squad Lead can request clarification", 403);
    }

    const task = await taskModel.findById(taskId, {
      select: { projectId: true, taskNumber: true },
    });
    if (!task) return errorResponse("Task not found", 404);
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
  } catch (err) {
    return handleError(err);
  }
}
