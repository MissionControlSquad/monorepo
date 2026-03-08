import { on } from "../bus";
import { EventTypes } from "../../constants";
import { prisma } from "../../prisma";
import { notify } from "../../services/notification";

/**
 * Resolve the userId from a task's creator profile.
 * Returns null if the creator is not a human user.
 */
async function getTaskCreatorUserId(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      createdByProfile: {
        select: { userId: true, kind: true },
      },
    },
  });
  if (!task?.createdByProfile) return null;
  if (task.createdByProfile.kind !== "human") return null;
  return task.createdByProfile.userId;
}

/**
 * Get all human user IDs who are members of the task's project.
 */
async function getProjectHumanUserIds(taskId: string): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task?.projectId) return [];

  const members = await prisma.projectMember.findMany({
    where: { projectId: task.projectId, status: "active" },
    select: {
      profile: {
        select: { userId: true, kind: true },
      },
    },
  });

  return members
    .filter((m) => m.profile.kind === "human" && m.profile.userId)
    .map((m) => m.profile.userId!);
}

/**
 * Get human user IDs from profile IDs.
 */
async function getUserIdsFromProfileIds(profileIds: string[]): Promise<string[]> {
  if (!profileIds.length) return [];
  const profiles = await prisma.profile.findMany({
    where: { id: { in: profileIds }, kind: "human" },
    select: { userId: true },
  });
  return profiles.filter((p) => p.userId).map((p) => p.userId!);
}

/**
 * Get all human user IDs who are members of a project (by project ID directly).
 */
async function getProjectHumanUserIdsByProjectId(projectId: string): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, status: "active" },
    select: {
      profile: {
        select: { userId: true, kind: true },
      },
    },
  });

  return members
    .filter((m) => m.profile.kind === "human" && m.profile.userId)
    .map((m) => m.profile.userId!);
}

function taskUrl(taskId: string, taskNumber?: number): string {
  return `/task/${taskNumber ?? taskId}`;
}

// ─── Task created → notify assignees ─────────────────────────────────

on(EventTypes.TASK_CREATED, async (e) => {
  if (!e.assigneeIds?.length) return;

  const userIds = await getUserIdsFromProfileIds(e.assigneeIds);

  // Resolve creator's userId so we can skip them
  const creatorUserIds = e.profileId ? await getUserIdsFromProfileIds([e.profileId]) : [];
  const creatorUserId = creatorUserIds[0] ?? null;

  await Promise.allSettled(
    userIds
      .filter((uid) => uid !== creatorUserId)
      .map((userId) =>
        notify({
          userId,
          type: "task_assigned",
          title: `Assigned: ${e.title}`,
          body: `You were assigned to "${e.title}".`,
          taskId: e.taskId,
          url: taskUrl(e.taskId, e.taskNumber),
        }),
      ),
  );
});

// ─── Task assignees changed → notify newly added assignees ───────────

on(EventTypes.TASK_ASSIGNEES_CHANGED, async (e) => {
  if (!e.addedIds?.length) return;

  const userIds = await getUserIdsFromProfileIds(e.addedIds);

  await Promise.allSettled(
    userIds.map((userId) =>
      notify({
        userId,
        type: "task_assigned",
        title: `Assigned: ${e.title}`,
        body: `You were assigned to "${e.title}".`,
        taskId: e.taskId,
        url: taskUrl(e.taskId, e.taskNumber),
      }),
    ),
  );
});

// ─── Task done → notify creator ──────────────────────────────────────

on(EventTypes.TASK_STATUS_CHANGED, async (e) => {
  if (e.toStatus === "done") {
    const userId = await getTaskCreatorUserId(e.taskId);
    if (!userId) return;
    await notify({
      userId,
      type: "task_done",
      title: `Task completed: ${e.title}`,
      body: `"${e.title}" has been marked as done.`,
      taskId: e.taskId,
      url: taskUrl(e.taskId, e.taskNumber),
    });
  }

  if (e.toStatus === "review") {
    // Notify task creator + project human members
    const [creatorId, memberIds] = await Promise.all([
      getTaskCreatorUserId(e.taskId),
      getProjectHumanUserIds(e.taskId),
    ]);
    const uniqueIds = [...new Set([creatorId, ...memberIds].filter(Boolean) as string[])];

    await Promise.allSettled(
      uniqueIds.map((userId) =>
        notify({
          userId,
          type: "task_needs_review",
          title: `Review needed: ${e.title}`,
          body: `"${e.title}" is ready for review.`,
          taskId: e.taskId,
          url: taskUrl(e.taskId, e.taskNumber),
        }),
      ),
    );
  }
});

// ─── Clarification requested → notify creator ────────────────────────

on(EventTypes.TASK_CLARIFICATION_REQUESTED, async (e) => {
  const userId = await getTaskCreatorUserId(e.taskId);
  if (!userId) return;
  await notify({
    userId,
    type: "task_clarification_requested",
    title: `Clarification needed: ${e.title}`,
    body: `${e.reviewerName} requested clarification on "${e.title}".`,
    taskId: e.taskId,
    url: taskUrl(e.taskId, e.taskNumber),
  });
});

// ─── Task approved → notify creator ──────────────────────────────────

on(EventTypes.TASK_APPROVED, async (e) => {
  const userId = await getTaskCreatorUserId(e.taskId);
  if (!userId) return;
  await notify({
    userId,
    type: "task_approved",
    title: `Approved: ${e.title}`,
    body: `"${e.title}" was approved by ${e.reviewerName}.`,
    taskId: e.taskId,
    url: taskUrl(e.taskId, e.taskNumber),
  });
});

// ─── Task rejected → notify creator ─────────────────────────────────

on(EventTypes.TASK_REJECTED, async (e) => {
  const userId = await getTaskCreatorUserId(e.taskId);
  if (!userId) return;
  await notify({
    userId,
    type: "task_rejected",
    title: `Rejected: ${e.title}`,
    body: `"${e.title}" was rejected by ${e.reviewerName}: ${e.rejectionReason}`,
    taskId: e.taskId,
    url: taskUrl(e.taskId, e.taskNumber),
  });
});

// ─── Message with @mention → notify mentioned humans ─────────────────

on(EventTypes.MESSAGE_CREATED, async (e) => {
  if (!e.mentionedProfileIds?.length) return;

  const userIds = await getUserIdsFromProfileIds(e.mentionedProfileIds);
  await Promise.allSettled(
    userIds.map((userId) =>
      notify({
        userId,
        type: "mention",
        title: `Mentioned in: ${e.taskTitle}`,
        body: `${e.fromAgentName} mentioned you in "${e.taskTitle}".`,
        taskId: e.taskId,
        messageId: e.messageId,
        url: taskUrl(e.taskId, e.taskNumber),
      }),
    ),
  );
});

// ─── New comment on task → notify task creator ───────────────────────

on(EventTypes.MESSAGE_CREATED, async (e) => {
  const creatorUserId = await getTaskCreatorUserId(e.taskId);
  if (!creatorUserId) return;

  // Don't notify if the comment author is the task creator
  const authorUserIds = e.fromProfileId ? await getUserIdsFromProfileIds([e.fromProfileId]) : [];
  if (authorUserIds.includes(creatorUserId)) return;

  await notify({
    userId: creatorUserId,
    type: "new_comment",
    title: `New comment on: ${e.taskTitle}`,
    body: `${e.fromAgentName} commented on "${e.taskTitle}".`,
    taskId: e.taskId,
    messageId: e.messageId,
    url: taskUrl(e.taskId, e.taskNumber),
  });
});

// ─── Deliverable submitted → notify task creator ─────────────────────

on(EventTypes.DELIVERABLE_SUBMITTED, async (e) => {
  const userId = await getTaskCreatorUserId(e.taskId);
  if (!userId) return;
  await notify({
    userId,
    type: "deliverable_submitted",
    title: `Deliverable: ${e.title}`,
    body: `${e.agentName} submitted "${e.title}" for "${e.taskTitle}".`,
    taskId: e.taskId,
    url: taskUrl(e.taskId, e.taskNumber),
  });
});

// ─── Document created on task → notify task creator ──────────────────

on(EventTypes.DOCUMENT_CREATED, async (e) => {
  if (!e.taskId) return;

  const creatorUserId = await getTaskCreatorUserId(e.taskId);
  if (!creatorUserId) return;

  // Don't notify if the document author is the task creator
  const authorUserIds = e.profileId ? await getUserIdsFromProfileIds([e.profileId]) : [];
  if (authorUserIds.includes(creatorUserId)) return;

  await notify({
    userId: creatorUserId,
    type: "document_added",
    title: `New ${e.docType}: ${e.title}`,
    body: `${e.creatorName} added ${e.docType} "${e.title}" to "${e.taskTitle}".`,
    taskId: e.taskId,
  });
});

// ─── Project member added → notify human project members ─────────────

on(EventTypes.PROJECT_MEMBER_ADDED, async (e) => {
  const humanUserIds = await getProjectHumanUserIdsByProjectId(e.projectId);
  if (!humanUserIds.length) return;

  await Promise.allSettled(
    humanUserIds.map((userId) =>
      notify({
        userId,
        type: "team_update",
        title: `New team member: ${e.agentName}`,
        body: `${e.agentName} joined project "${e.projectName}".`,
        url: `/projects/${e.projectId}`,
      }),
    ),
  );
});

// ─── Project member removed → notify human project members ───────────

on(EventTypes.PROJECT_MEMBER_REMOVED, async (e) => {
  const humanUserIds = await getProjectHumanUserIdsByProjectId(e.projectId);
  if (!humanUserIds.length) return;

  await Promise.allSettled(
    humanUserIds.map((userId) =>
      notify({
        userId,
        type: "team_update",
        title: `Team member left: ${e.agentName}`,
        body: `${e.agentName} was removed from project "${e.projectName}".`,
        url: `/projects/${e.projectId}`,
      }),
    ),
  );
});
