export const dynamic = "force-dynamic";

import { taskModel } from "@/server/models/task";
import { pubsub, PubSubEvent, taskTopic, taskProjectTopic } from "@/server/pubsub";
import { TaskStatus, Priority } from "@/server/constants";
import { withAgent } from "../_lib/with-agent";
import { assertAssignableAgents } from "@/server/assignment-guard";
import { assertProjectWritable } from "@/server/system-settings";
import { successResponse, errorResponse } from "../_lib/json-response";
import { validateBody, createTaskSchema } from "../_lib/validation";
import { apiLimiters, checkRateLimit } from "../_lib/rate-limit-check";
import { log } from "../_lib/logger";
import {
  assertProjectMember,
  assertAllMembersOfProject,
  getAgentProjectIds,
} from "../_lib/project-access";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { generateRecurringTasks } from "@/server/recurring-tasks";
import {
  tryDeliverTaskToLiveAgents,
  tryDeliverInboxTaskNotification,
} from "@/server/services/live-task-delivery";

export const GET = withAgent(async (request, agent) => {
  const { searchParams } = new URL(request.url);

  const assigneeId = searchParams.get("assigneeId");
  const status = searchParams.get("status");
  const projectId = searchParams.get("projectId");

  // Lazy-generate any overdue recurring task instances
  await generateRecurringTasks({ projectId: projectId ?? undefined });
  const includeDone = searchParams.get("includeDone") === "true";

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status.includes(",") ? { in: status.split(",") } : status;
  }

  if (projectId) {
    await assertProjectMember(agent.id, projectId);
    where.projectId = projectId;
  } else {
    // Auto-scope: own projects' tasks + unscoped
    const agentProjectIds = await getAgentProjectIds(agent.id);
    where.OR = [{ projectId: { in: agentProjectIds } }, { projectId: null }];
  }

  if (assigneeId) {
    // Resolve agentId → profileId for filtering
    const assigneeProfileId = await getOrCreateAgentProfileId(assigneeId);
    where.assignees = { some: { profileId: assigneeProfileId } };
    if (!includeDone && !status) {
      where.status = { not: TaskStatus.DONE };
    }
  }

  const tasks = await taskModel.findMany({
    where,
    include: { assignees: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  log("tasks", `GET agent="${agent.name}" count=${tasks.length}`, request);
  return successResponse(tasks);
});

export const POST = withAgent(
  async (request, agent) => {
    const limited = await checkRateLimit(apiLimiters.tasks, request);
    if (limited) return limited;

    const parsed = await validateBody(request, createTaskSchema);
    if (parsed.error) return parsed.error;

    const {
      title,
      description,
      assigneeIds,
      priority,
      dueDate,
      tags,
      parentTaskId,
      projectId,
      blockedByTaskId,
    } = parsed.data;

    if (projectId) {
      await assertProjectWritable(projectId);
      await assertProjectMember(agent.id, projectId);
      if (assigneeIds?.length) {
        await assertAllMembersOfProject(assigneeIds, projectId);
      }
    }
    if (assigneeIds?.length) {
      try {
        await assertAssignableAgents(assigneeIds);
      } catch (e: any) {
        return errorResponse(e.message, 400);
      }
    }

    // Resolve agentIds → profileIds
    const assigneeProfileIds = await Promise.all(
      (assigneeIds ?? []).map((id: string) => getOrCreateAgentProfileId(id)),
    );
    const createdByProfileId = await getOrCreateAgentProfileId(agent.id);

    const task = await taskModel.create({
      data: {
        title,
        description,
        status: TaskStatus.INBOX,
        priority: priority ?? undefined,
        createdByProfileId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        tags: tags ?? [],
        parentTaskId: parentTaskId ?? undefined,
        projectId: projectId ?? undefined,
        blockedByTaskId: blockedByTaskId ?? undefined,
        assignees: {
          create: assigneeProfileIds.map((profileId: string) => ({ profileId })),
        },
      },
      include: { assignees: { include: { profile: true } } },
    });

    await taskModel.emitCreated(task, {
      createdBy: agent.id,
      creatorName: agent.name,
      assigneeIds: assigneeIds ?? [],
      fromDashboard: false,
    });

    const createPayload = { taskId: task.id, projectId: task.projectId ?? undefined };
    pubsub.publish(taskTopic(task.id), createPayload);
    if (task.projectId) pubsub.publish(taskProjectTopic(task.projectId), createPayload);
    pubsub.publish(PubSubEvent.TASK.UPDATED, createPayload);
    log(
      "tasks",
      `CREATED agent="${agent.name}" task=#${task.taskNumber} "${title}" project=${projectId ?? "none"}`,
      request,
    );

    // Live gateway: push to assigned agents immediately (task created with assignees).
    // For unassigned inbox tasks, notify all project members so they can pick it up.
    // Both are fire-and-forget — heartbeat is the fallback.
    if (assigneeIds?.length) {
      tryDeliverTaskToLiveAgents(assigneeIds, {
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: (task as any).description ?? null,
        priority: (task as any).priority ?? Priority.MEDIUM,
        assignedBy: agent.name,
      }).catch(() => undefined);
    } else if (projectId) {
      tryDeliverInboxTaskNotification(task.id, projectId, task.title, []).catch(() => undefined);
    }

    return successResponse(task, 201);
  },
  { blockOnShutdown: { error: "System is in shutdown mode. No new tasks can be created." } },
);
