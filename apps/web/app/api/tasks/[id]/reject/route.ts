import { taskModel } from "@/server/models/task";
import { messageModel } from "@/server/models";
import { Roles, TaskStatus } from "@/server/constants";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { validateBody, rejectTaskSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { assertProjectMember } from "../../../_lib/project-access";
import { isSystemShutdown } from "@/server/system-settings";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const v = await validateBody(request, rejectTaskSchema);
    if (v.error) return v.error;
    const body = v.data;
    const reviewer = await resolveAgent(request);
    const { id: taskId } = await ctx.params;

    if (!(await isFeatureEnabled(FLAG_KEYS.REVIEWS))) {
      return errorResponse("Reviews feature is not available on your current plan", 403);
    }

    if (await isSystemShutdown()) {
      return errorResponse("System is in shutdown mode. No task rejections allowed.", 503);
    }

    if (reviewer.role !== Roles.SQUAD_LEAD) {
      return errorResponse("Only Squad Lead can reject tasks", 403);
    }

    const task = await taskModel.findById(taskId, {
      include: {
        assignees: {
          include: { profile: { select: { agentId: true, displayName: true, username: true } } },
        },
      },
    });
    if (!task) return errorResponse("Task not found", 404);
    if (task.projectId) await assertProjectMember(reviewer.id, task.projectId);

    await taskModel.update(taskId, {
      data: { status: TaskStatus.ASSIGNED },
    });

    const changesList = (body.changesNeeded as string[]).map((c, i) => `${i + 1}. ${c}`).join("\n");
    const mentions = task.assignees
      .map((a: any) => `@${a.profile?.username ?? a.profile?.displayName ?? "unknown"}`)
      .join(" ");

    const reviewerProfileId = await getOrCreateAgentProfileId(reviewer.id);

    await messageModel.create({
      data: {
        taskId,
        fromProfileId: reviewerProfileId,
        content: `**Task rejected** by @${reviewer.username ?? reviewer.name}\n\n**Reason:** ${body.rejectionReason}\n\n**Changes needed:**\n${changesList}\n\n${mentions} please address these items.`,
      },
    });

    // Resolve assignee agentIds for notification compat
    const assigneeAgentIds = task.assignees
      .map((a: any) => a.profile?.agentId)
      .filter(Boolean) as string[];

    await taskModel.emitRejected(task, {
      reviewerId: reviewer.id,
      reviewerName: reviewer.name,
      assigneeIds: assigneeAgentIds,
      assigneeNames: task.assignees.map((a: any) => a.profile?.displayName ?? "Unknown"),
      rejectionReason: body.rejectionReason,
      changesNeeded: body.changesNeeded,
    });

    log(
      "task",
      `REJECTED agent="${reviewer.name}" task=#${task.taskNumber} reason="${body.rejectionReason}"`,
      request,
    );
    return successResponse({
      success: true,
      message: "Task rejected and moved back to assigned",
      newStatus: TaskStatus.ASSIGNED,
    });
  } catch (err) {
    return handleError(err);
  }
}
