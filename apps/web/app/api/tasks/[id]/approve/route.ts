import { taskModel } from "@/server/models/task";
import { messageModel } from "@/server/models";
import { parseChildTasks } from "@/server/sanitize";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { Roles, TaskStatus } from "@/server/constants";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { validateBody, approveTaskSchema } from "../../../_lib/validation";
import { log } from "../../../_lib/logger";
import { assertProjectMember } from "../../../_lib/project-access";
import { assertAssignableAgents } from "@/server/assignment-guard";
import { isSystemShutdown } from "@/server/system-settings";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";

type RouteContext = { params: Promise<{ id: string }> };

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
      include: {
        assignees: { include: { profile: { select: { agentId: true, displayName: true } } } },
      },
    });
    if (!task) return errorResponse("Task not found", 404);
    if (task.projectId) await assertProjectMember(reviewer.id, task.projectId);

    // Move to done + post approval comment in parallel
    const assigneeNames = task.assignees.map((a: any) => a.profile?.displayName ?? "Unknown");
    const comment =
      body.approvalComment ??
      `Task approved by @${reviewer.username ?? reviewer.name}. Great work ${assigneeNames.map((n: string) => `@${n}`).join(", ")}!`;

    const reviewerProfileId = await getOrCreateAgentProfileId(reviewer.id);

    await Promise.all([
      taskModel.update(taskId, {
        data: { status: TaskStatus.DONE },
      }),
      messageModel.create({
        data: {
          taskId,
          fromProfileId: reviewerProfileId,
          content: comment,
        },
      }),
    ]);

    // Create child tasks if provided
    let childTaskSummaries: { taskId: string; taskNumber: number; title: string }[] | undefined;
    if (body.childTasks) {
      let children;
      try {
        children = parseChildTasks(body.childTasks);
      } catch (e: any) {
        return errorResponse(e.message, 400);
      }

      for (const child of children) {
        if (child.assigneeIds?.length) {
          try {
            await assertAssignableAgents(child.assigneeIds);
          } catch (e: any) {
            return errorResponse(e.message, 400);
          }
        }
      }

      // Create all child tasks in parallel
      const newTasks = await Promise.all(
        children.map(async (child) => {
          // Resolve assigneeIds → profileIds
          const childProfileIds = await Promise.all(
            (child.assigneeIds ?? []).map((id) => getOrCreateAgentProfileId(id)),
          );
          return taskModel.create({
            data: {
              title: child.title,
              description: `${child.description}\n\n_Spawned from #${task.taskNumber}: ${task.title}_`,
              status: TaskStatus.INBOX,
              priority: (child.priority as any) ?? undefined,
              parentTaskId: taskId,
              projectId: task.projectId ?? undefined,
              assignees: {
                create: childProfileIds.map((profileId) => ({
                  profileId,
                })),
              },
            },
            select: { id: true, taskNumber: true, title: true },
          });
        }),
      );

      childTaskSummaries = newTasks.map((t: { id: string; taskNumber: number; title: string }) => ({
        taskId: t.id,
        taskNumber: t.taskNumber,
        title: t.title,
      }));

      // Emit all child task events in parallel
      await Promise.all(
        newTasks.map((newTask, i) =>
          taskModel.emitCreated(newTask, {
            createdBy: reviewer.id,
            creatorName: reviewer.name,
            assigneeIds: children[i].assigneeIds ?? [],
            fromDashboard: false,
          }),
        ),
      );
    }

    // Resolve assignee agentIds for notification compat
    const assigneeAgentIds = task.assignees
      .map((a: any) => a.profile?.agentId)
      .filter(Boolean) as string[];

    await taskModel.emitApproved(task, {
      reviewerId: reviewer.id,
      reviewerName: reviewer.name,
      assigneeIds: assigneeAgentIds,
      assigneeNames,
      childTasks: childTaskSummaries,
    });

    log(
      "task",
      `APPROVED agent="${reviewer.name}" task=#${task.taskNumber} childTasks=${childTaskSummaries?.length ?? 0}`,
      request,
    );
    return successResponse({
      success: true,
      message: "Task approved and moved to done",
      newStatus: TaskStatus.DONE,
      childTaskIds: childTaskSummaries?.map((t) => t.taskId) ?? null,
    });
  } catch (err) {
    return handleError(err);
  }
}
