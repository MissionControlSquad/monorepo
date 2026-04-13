import { diffTaskAssignees } from "@agentcenter/database";
import { taskModel } from "@/server/models/task";
import { agentModel } from "@/server/models";
import { pubsub, PubSubEvent, taskTopic, taskProjectTopic } from "@/server/pubsub";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError, assertFound } from "../../_lib/json-response";
import { ERR } from "../../_lib/error-messages";
import { validateBody, updateTaskSchema } from "../../_lib/validation";
import { log } from "../../_lib/logger";
import { assertProjectMember, assertAllMembersOfProject } from "../../_lib/project-access";
import { assertAssignableAgents } from "@/server/assignment-guard";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { isSystemShutdown, isProjectShutdown } from "@/server/system-settings";
import {
  tryDeliverTaskToLiveAgents,
  tryDeliverReviewNotification,
} from "@/server/services/live-task-delivery";
import { TaskStatus, Priority } from "@/server/constants";
import type { RouteContext } from "../../_lib/route-context";

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    const task = await taskModel.findById(id, {
      include: { assignees: { include: { profile: true } } },
    });

    assertFound(task, ERR.TASK_NOT_FOUND);
    if (task.projectId) {
      if (await isProjectShutdown(task.projectId)) {
        return errorResponse(ERR.TASK_NOT_FOUND, 404);
      }
      await assertProjectMember(agent.id, task.projectId);
    }
    return successResponse(task);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const v = await validateBody(request, updateTaskSchema);
    if (v.error) return v.error;
    const body = v.data;
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    if (await isSystemShutdown()) {
      return errorResponse("System is in shutdown mode. No task updates allowed.", 503);
    }

    const oldTask = await taskModel.findById(id, {
      include: { assignees: { include: { profile: true } } },
    });
    assertFound(oldTask, ERR.TASK_NOT_FOUND);
    if (oldTask.projectId) {
      if (await isProjectShutdown(oldTask.projectId)) {
        return errorResponse(ERR.TASK_NOT_FOUND, 404);
      }
      await assertProjectMember(agent.id, oldTask.projectId);
    }
    if (body.assigneeIds?.length) {
      try {
        await assertAssignableAgents(body.assigneeIds);
      } catch (e: any) {
        return errorResponse(e.message, 400);
      }
      if (oldTask.projectId) {
        await assertAllMembersOfProject(body.assigneeIds, oldTask.projectId);
      }
    }

    // Build update data (only include changed fields)
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.parentTaskId !== undefined) data.parentTaskId = body.parentTaskId ?? null;
    if (body.blockedByTaskId !== undefined) data.blockedByTaskId = body.blockedByTaskId ?? null;

    const task = await taskModel.update(id, { data });

    // Handle assignee changes
    if (body.assigneeIds) {
      // Resolve incoming agentIds to profileIds
      const newProfileIds = await Promise.all(
        (body.assigneeIds as string[]).map((aid: string) => getOrCreateAgentProfileId(aid)),
      );
      const oldProfileIds = new Set(oldTask.assignees.map((a: any) => a.profileId));
      const newProfileIdSet = new Set(newProfileIds);

      const addedProfileIds = newProfileIds.filter((pid: string) => !oldProfileIds.has(pid));
      const removedProfileIds = oldTask.assignees
        .map((a: any) => a.profileId as string)
        .filter((pid: string) => !newProfileIdSet.has(pid));

      // Atomic transaction to prevent race conditions with concurrent updates
      if (addedProfileIds.length > 0 || removedProfileIds.length > 0) {
        await diffTaskAssignees(id, addedProfileIds, removedProfileIds);
      }

      if (addedProfileIds.length > 0 || removedProfileIds.length > 0) {
        log(
          "task",
          `ASSIGNEES agent="${agent.name}" task=#${oldTask.taskNumber} added=${addedProfileIds.length} removed=${removedProfileIds.length}`,
          request,
        );
        // Resolve back to agentIds for events
        const agentToProfile = new Map<string, string>();
        for (let i = 0; i < (body.assigneeIds as string[]).length; i++) {
          agentToProfile.set((body.assigneeIds as string[])[i], newProfileIds[i]);
        }
        const addedAgentIds = (body.assigneeIds as string[]).filter((aid: string) => {
          const pid = agentToProfile.get(aid)!;
          return !oldProfileIds.has(pid);
        });

        const removedAgentIds: string[] = [];
        for (const a of oldTask.assignees) {
          const pid = (a as any).profileId as string;
          if (!newProfileIdSet.has(pid)) {
            const agentId = (a as any).profile?.agentId;
            if (agentId) removedAgentIds.push(agentId);
          }
        }

        const [addedAgents, removedAgents] = await Promise.all([
          agentModel.findMany({
            where: { id: { in: addedAgentIds } },
            select: { name: true },
          }),
          agentModel.findMany({
            where: { id: { in: removedAgentIds } },
            select: { name: true },
          }),
        ]);

        await taskModel.emitAssigneesChanged(task, {
          addedIds: addedAgentIds,
          removedIds: removedAgentIds,
          addedNames: addedAgents.map((a) => a.name),
          removedNames: removedAgents.map((a) => a.name),
        });

        // Live Gateway: attempt instant delivery to agents with live connections.
        // Fire-and-forget — never affects the task API response.
        // If no live connection exists, existing heartbeat handles the task.
        if (addedAgentIds.length > 0) {
          tryDeliverTaskToLiveAgents(addedAgentIds, {
            taskId: task.id,
            taskTitle: task.title,
            taskDescription: (task as any).description ?? null,
            priority: (task as any).priority ?? Priority.MEDIUM,
            assignedBy: agent.name,
          }).catch((err) => console.error("[live-task-delivery] error:", err));
        }
      }
    }

    // Emit status change event
    if (body.status && body.status !== oldTask.status) {
      log(
        "task",
        `STATUS agent="${agent.name}" task=#${oldTask.taskNumber} ${oldTask.status}→${body.status}`,
        request,
      );
      await taskModel.emitStatusChanged(task, {
        fromStatus: oldTask.status,
        toStatus: body.status,
        changedBy: agent.id,
      });

      // Live gateway: notify squad leads immediately when task enters review.
      // Fire-and-forget — heartbeat (hasPendingReview) is the fallback.
      if (body.status === TaskStatus.REVIEW) {
        tryDeliverReviewNotification(task.id, task.projectId ?? null, task.title).catch(
          () => undefined,
        );
      }
    }

    // Emit generic fields updated
    if (!body.status && !body.assigneeIds && Object.keys(data).length > 0) {
      log(
        "task",
        `UPDATED agent="${agent.name}" task=#${oldTask.taskNumber} fields=[${Object.keys(data).join(",")}]`,
        request,
      );
      await taskModel.emitFieldsUpdated(task);
    }

    // Publish to all topic tiers so subscriptions scoped by project or task receive the update
    const taskPayload = { taskId: task.id, projectId: task.projectId ?? undefined };
    pubsub.publish(taskTopic(task.id), taskPayload);
    if (task.projectId) pubsub.publish(taskProjectTopic(task.projectId), taskPayload);
    pubsub.publish(PubSubEvent.TASK.UPDATED, taskPayload);

    // Re-fetch with assignees
    const updated = await taskModel.findById(id, {
      include: { assignees: { include: { profile: true } } },
    });
    return successResponse(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    const task = await taskModel.findById(id, {
      include: { assignees: { include: { profile: true } } },
    });
    assertFound(task, ERR.TASK_NOT_FOUND);
    if (task.projectId) await assertProjectMember(agent.id, task.projectId);

    // Resolve profileId → agentId for notification compat
    const assigneeAgentIds = task.assignees
      .map((a: any) => a.profile?.agentId)
      .filter(Boolean) as string[];

    log("task", `DELETED agent="${agent.name}" task=#${task.taskNumber} "${task.title}"`, request);
    await taskModel.emitDeleted(task, {
      agentId: agent.id,
      agentName: agent.name,
      assigneeIds: assigneeAgentIds,
    });

    const deletePayload = { taskId: task.id, projectId: task.projectId ?? undefined };
    pubsub.publish(taskTopic(task.id), deletePayload);
    if (task.projectId) pubsub.publish(taskProjectTopic(task.projectId), deletePayload);
    pubsub.publish(PubSubEvent.TASK.UPDATED, deletePayload);
    await taskModel.softDelete(id);
    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
