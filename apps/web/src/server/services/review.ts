/**
 * Shared review service functions.
 *
 * Both the REST API routes and GraphQL resolvers delegate to these functions,
 * ensuring identical business logic on all code paths.
 */
import { messageModel } from "../models";
import { taskModel } from "../models/task";
import { TaskStatus } from "../constants";
import { assertAssignableAgents } from "../assignment-guard";
import { getOrCreateAgentProfileId } from "../agent-profile";

export interface ReviewerInfo {
  id: string;
  name: string;
  username?: string | null;
}

export interface ChildTaskInput {
  title: string;
  description?: string;
  priority?: string;
  assigneeIds?: string[];
}

// ── Approve ────────────────────────────────────────────────────────────────────

export async function performApproveTask(params: {
  reviewer: ReviewerInfo;
  taskId: string;
  approvalComment?: string | null;
  childTasks?: ChildTaskInput[];
}): Promise<{ newStatus: string; childTaskIds: string[] | null }> {
  const { reviewer, taskId, approvalComment, childTasks } = params;

  const task = await taskModel.findById(taskId, {
    include: {
      assignees: { include: { profile: { select: { agentId: true, displayName: true } } } },
    },
  });
  if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });

  const assigneeNames: string[] = task.assignees.map(
    (a: any) => a.profile?.displayName ?? "Unknown",
  );
  const comment =
    approvalComment ||
    `Task approved by @${reviewer.username ?? reviewer.name}. Great work ${assigneeNames.map((n) => `@${n}`).join(", ")}!`;

  const reviewerProfileId = await getOrCreateAgentProfileId(reviewer.id);

  const fromStatusApprove = task.status;
  await Promise.all([
    taskModel.update(taskId, { data: { status: TaskStatus.DONE } }),
    messageModel.create({
      data: { taskId, fromProfileId: reviewerProfileId, content: comment },
    }),
  ]);

  await taskModel
    .emitStatusChanged(task, {
      fromStatus: fromStatusApprove,
      toStatus: TaskStatus.DONE,
      changedBy: reviewer.id,
    })
    .catch((err) => console.error("[review] emitStatusChanged (approve) failed", err));

  // Create child tasks
  const childTaskIds: string[] = [];
  if (childTasks?.length) {
    for (const child of childTasks) {
      if (child.assigneeIds?.length) {
        await assertAssignableAgents(child.assigneeIds);
      }
    }

    const newTasks = await Promise.all(
      childTasks.map(async (child) => {
        const profileIds = await Promise.all(
          (child.assigneeIds ?? []).map((id) => getOrCreateAgentProfileId(id)),
        );
        return taskModel.create({
          data: {
            title: child.title,
            description:
              `${child.description ?? ""}\n\n_Spawned from #${task.taskNumber}: ${task.title}_`.trim(),
            status: TaskStatus.INBOX,
            priority: (child.priority as any) ?? undefined,
            parentTaskId: taskId,
            projectId: task.projectId ?? undefined,
            assignees: { create: profileIds.map((profileId) => ({ profileId })) },
          },
          select: { id: true, taskNumber: true, title: true },
        });
      }),
    );

    await Promise.all(
      newTasks.map((newTask, i) =>
        taskModel.emitCreated(newTask, {
          createdBy: reviewer.id,
          creatorName: reviewer.name,
          assigneeIds: childTasks[i].assigneeIds ?? [],
          fromDashboard: false,
        }),
      ),
    );

    childTaskIds.push(...newTasks.map((t: any) => t.id));
  }

  const assigneeAgentIds = task.assignees
    .map((a: any) => a.profile?.agentId)
    .filter(Boolean) as string[];

  await taskModel.emitApproved(task, {
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    assigneeIds: assigneeAgentIds,
    assigneeNames,
    childTasks: childTaskIds.length
      ? await Promise.all(
          childTaskIds.map(async (id) => {
            const t = await taskModel.findByIdOrThrow(id, {
              select: { id: true, taskNumber: true, title: true },
            });
            return { taskId: t.id, taskNumber: t.taskNumber, title: t.title };
          }),
        )
      : undefined,
  });

  return { newStatus: TaskStatus.DONE, childTaskIds: childTaskIds.length ? childTaskIds : null };
}

// ── Reject ─────────────────────────────────────────────────────────────────────

export async function performRejectTask(params: {
  reviewer: ReviewerInfo;
  taskId: string;
  rejectionReason: string;
  changesNeeded: string[];
}): Promise<{ newStatus: string }> {
  const { reviewer, taskId, rejectionReason, changesNeeded } = params;

  const task = await taskModel.findById(taskId, {
    include: {
      assignees: {
        include: { profile: { select: { agentId: true, displayName: true, username: true } } },
      },
    },
  });
  if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });

  const changesList = changesNeeded.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const mentions = task.assignees
    .map((a: any) => `@${a.profile?.username ?? a.profile?.displayName ?? "unknown"}`)
    .join(" ");

  const reviewerProfileId = await getOrCreateAgentProfileId(reviewer.id);

  const fromStatusReject = task.status;
  await Promise.all([
    taskModel.update(taskId, { data: { status: TaskStatus.ASSIGNED } }),
    messageModel.create({
      data: {
        taskId,
        fromProfileId: reviewerProfileId,
        content: `**Task rejected** by @${reviewer.username ?? reviewer.name}\n\n**Reason:** ${rejectionReason}\n\n**Changes needed:**\n${changesList}\n\n${mentions} please address these items.`,
      },
    }),
  ]);

  await taskModel
    .emitStatusChanged(task, {
      fromStatus: fromStatusReject,
      toStatus: TaskStatus.ASSIGNED,
      changedBy: reviewer.id,
    })
    .catch((err) => console.error("[review] emitStatusChanged (reject) failed", err));

  const assigneeAgentIds = task.assignees
    .map((a: any) => a.profile?.agentId)
    .filter(Boolean) as string[];

  await taskModel.emitRejected(task, {
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    assigneeIds: assigneeAgentIds,
    assigneeNames: task.assignees.map((a: any) => a.profile?.displayName ?? "Unknown"),
    rejectionReason,
    changesNeeded,
  });

  return { newStatus: TaskStatus.ASSIGNED };
}

// ── Request Clarification ──────────────────────────────────────────────────────

export async function performRequestClarification(params: {
  reviewer: ReviewerInfo;
  taskId: string;
  questions: string[];
}): Promise<{ newStatus: string }> {
  const { reviewer, taskId, questions } = params;

  const task = await taskModel.findById(taskId, {
    include: {
      assignees: {
        include: { profile: { select: { agentId: true, displayName: true, username: true } } },
      },
    },
  });
  if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });

  // Ensure task stays in review status
  if (task.status !== TaskStatus.REVIEW) {
    await taskModel.update(taskId, { data: { status: TaskStatus.REVIEW } });
    await taskModel
      .emitStatusChanged(task, {
        fromStatus: task.status,
        toStatus: TaskStatus.REVIEW,
        changedBy: reviewer.id,
      })
      .catch((err) => console.error("[review] emitStatusChanged (clarification) failed", err));
  }

  const questionList = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const mentions = task.assignees
    .map((a: any) => `@${a.profile?.username ?? a.profile?.displayName ?? "unknown"}`)
    .join(" ");

  const reviewerProfileId = await getOrCreateAgentProfileId(reviewer.id);

  await messageModel.create({
    data: {
      taskId,
      fromProfileId: reviewerProfileId,
      content: `**Clarification needed** from @${reviewer.username ?? reviewer.name}\n\n**Questions:**\n${questionList}\n\n${mentions} please respond.`,
    },
  });

  const assigneeAgentIds = task.assignees
    .map((a: any) => a.profile?.agentId)
    .filter(Boolean) as string[];

  await taskModel.emitClarificationRequested(task, {
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    assigneeIds: assigneeAgentIds,
    assigneeNames: task.assignees.map((a: any) => a.profile?.displayName ?? "Unknown"),
    questions,
  });

  return { newStatus: TaskStatus.REVIEW };
}
