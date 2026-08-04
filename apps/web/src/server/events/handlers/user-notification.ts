import { on } from "../bus";
import { EventTypes, TaskStatus, ProfileKind, NotificationKind } from "../../constants";
import {
  getTaskCreatorProfile,
  getTaskProjectId,
  getTaskWorkspaceId,
  getProjectWorkspaceId,
  getProjectHumanUserIdsByProjectId,
  getHumanUserIdsFromProfileIds,
} from "@agentcenter/database";
import { notify } from "../../services/notification";

/**
 * Resolve the userId from a task's creator profile.
 * Returns null if the creator is not a human user.
 */
async function getTaskCreatorUserId(taskId: string): Promise<string | null> {
  const profile = await getTaskCreatorProfile(taskId);
  if (!profile) return null;
  if (profile.kind !== ProfileKind.HUMAN) return null;
  return profile.userId;
}

/**
 * Get all human user IDs who are members of the task's project.
 */
async function getProjectHumanUserIds(taskId: string): Promise<string[]> {
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return [];
  return getProjectHumanUserIdsByProjectId(projectId);
}

/**
 * Get human user IDs from profile IDs.
 */
async function getUserIdsFromProfileIds(profileIds: string[]): Promise<string[]> {
  return getHumanUserIdsFromProfileIds(profileIds);
}

function taskUrl(taskId: string, taskNumber?: number): string {
  return `/task/${taskNumber ?? taskId}`;
}

// ─── Task created → notify assignees ─────────────────────────────────

on(EventTypes.TASK_CREATED, async (e) => {
  if (!e.assigneeIds?.length) return;

  const [userIds, workspaceId] = await Promise.all([
    getUserIdsFromProfileIds(e.assigneeIds),
    getTaskWorkspaceId(e.taskId),
  ]);

  // Resolve creator's userId so we can skip them
  const creatorUserIds = e.profileId ? await getUserIdsFromProfileIds([e.profileId]) : [];
  const creatorUserId = creatorUserIds[0] ?? null;

  await Promise.allSettled(
    userIds
      .filter((uid) => uid !== creatorUserId)
      .map((userId) =>
        notify({
          userId,
          type: NotificationKind.TASK_ASSIGNED,
          title: `Assigned: ${e.title}`,
          body: `You were assigned to "${e.title}".`,
          taskId: e.taskId,
          url: taskUrl(e.taskId, e.taskNumber),
          workspaceId: workspaceId ?? undefined,
        }),
      ),
  );
});

// ─── Task assignees changed → notify newly added assignees ───────────

on(EventTypes.TASK_ASSIGNEES_CHANGED, async (e) => {
  if (!e.addedIds?.length) return;

  const [userIds, workspaceId] = await Promise.all([
    getUserIdsFromProfileIds(e.addedIds),
    getTaskWorkspaceId(e.taskId),
  ]);

  await Promise.allSettled(
    userIds.map((userId) =>
      notify({
        userId,
        type: NotificationKind.TASK_ASSIGNED,
        title: `Assigned: ${e.title}`,
        body: `You were assigned to "${e.title}".`,
        taskId: e.taskId,
        url: taskUrl(e.taskId, e.taskNumber),
        workspaceId: workspaceId ?? undefined,
      }),
    ),
  );
});

// ─── Task done → notify creator ──────────────────────────────────────

on(EventTypes.TASK_STATUS_CHANGED, async (e) => {
  if (e.toStatus === TaskStatus.DONE) {
    const [userId, workspaceId] = await Promise.all([
      getTaskCreatorUserId(e.taskId),
      getTaskWorkspaceId(e.taskId),
    ]);
    if (!userId) return;
    await notify({
      userId,
      type: NotificationKind.TASK_DONE,
      title: `Task completed: ${e.title}`,
      body: `"${e.title}" has been marked as done.`,
      taskId: e.taskId,
      url: taskUrl(e.taskId, e.taskNumber),
      workspaceId: workspaceId ?? undefined,
    });
  }

  if (e.toStatus === TaskStatus.REVIEW) {
    // Notify task creator + project human members
    const [creatorId, memberIds, workspaceId] = await Promise.all([
      getTaskCreatorUserId(e.taskId),
      getProjectHumanUserIds(e.taskId),
      getTaskWorkspaceId(e.taskId),
    ]);
    const uniqueIds = [...new Set([creatorId, ...memberIds].filter(Boolean) as string[])];

    await Promise.allSettled(
      uniqueIds.map((userId) =>
        notify({
          userId,
          type: NotificationKind.TASK_NEEDS_REVIEW,
          title: `Review needed: ${e.title}`,
          body: `"${e.title}" is ready for review.`,
          taskId: e.taskId,
          url: taskUrl(e.taskId, e.taskNumber),
          workspaceId: workspaceId ?? undefined,
        }),
      ),
    );
  }
});

// ─── Clarification requested → notify creator ────────────────────────

on(EventTypes.TASK_CLARIFICATION_REQUESTED, async (e) => {
  const [userId, workspaceId] = await Promise.all([
    getTaskCreatorUserId(e.taskId),
    getTaskWorkspaceId(e.taskId),
  ]);
  if (!userId) return;
  await notify({
    userId,
    type: NotificationKind.TASK_CLARIFICATION_REQUESTED,
    title: `Clarification needed: ${e.title}`,
    body: `${e.reviewerName} requested clarification on "${e.title}".`,
    taskId: e.taskId,
    url: taskUrl(e.taskId, e.taskNumber),
    workspaceId: workspaceId ?? undefined,
  });
});

// ─── Task approved → notify creator ──────────────────────────────────

on(EventTypes.TASK_APPROVED, async (e) => {
  const [userId, workspaceId] = await Promise.all([
    getTaskCreatorUserId(e.taskId),
    getTaskWorkspaceId(e.taskId),
  ]);
  if (!userId) return;
  await notify({
    userId,
    type: NotificationKind.TASK_APPROVED,
    title: `Approved: ${e.title}`,
    body: `"${e.title}" was approved by ${e.reviewerName}.`,
    taskId: e.taskId,
    url: taskUrl(e.taskId, e.taskNumber),
    workspaceId: workspaceId ?? undefined,
  });
});

// ─── Task rejected → notify creator ─────────────────────────────────

on(EventTypes.TASK_REJECTED, async (e) => {
  const [userId, workspaceId] = await Promise.all([
    getTaskCreatorUserId(e.taskId),
    getTaskWorkspaceId(e.taskId),
  ]);
  if (!userId) return;
  await notify({
    userId,
    type: NotificationKind.TASK_REJECTED,
    title: `Rejected: ${e.title}`,
    body: `"${e.title}" was rejected by ${e.reviewerName}: ${e.rejectionReason}`,
    taskId: e.taskId,
    url: taskUrl(e.taskId, e.taskNumber),
    workspaceId: workspaceId ?? undefined,
  });
});

// ─── Message with @mention → notify mentioned humans ─────────────────

on(EventTypes.MESSAGE_CREATED, async (e) => {
  if (!e.mentionedProfileIds?.length) return;

  const [userIds, workspaceId] = await Promise.all([
    getUserIdsFromProfileIds(e.mentionedProfileIds),
    getTaskWorkspaceId(e.taskId),
  ]);
  await Promise.allSettled(
    userIds.map((userId) =>
      notify({
        userId,
        type: NotificationKind.MENTION,
        title: `Mentioned in: ${e.taskTitle}`,
        body: `${e.fromAgentName} mentioned you in "${e.taskTitle}".`,
        taskId: e.taskId,
        messageId: e.messageId,
        url: taskUrl(e.taskId, e.taskNumber),
        workspaceId: workspaceId ?? undefined,
      }),
    ),
  );
});

// ─── New comment on task → notify task creator ───────────────────────

on(EventTypes.MESSAGE_CREATED, async (e) => {
  const [creatorUserId, workspaceId] = await Promise.all([
    getTaskCreatorUserId(e.taskId),
    getTaskWorkspaceId(e.taskId),
  ]);
  if (!creatorUserId) return;

  // Don't notify if the comment author is the task creator
  const authorUserIds = e.fromProfileId ? await getUserIdsFromProfileIds([e.fromProfileId]) : [];
  if (authorUserIds.includes(creatorUserId)) return;

  await notify({
    userId: creatorUserId,
    type: NotificationKind.NEW_COMMENT,
    title: `New comment on: ${e.taskTitle}`,
    body: `${e.fromAgentName} commented on "${e.taskTitle}".`,
    taskId: e.taskId,
    messageId: e.messageId,
    url: taskUrl(e.taskId, e.taskNumber),
    workspaceId: workspaceId ?? undefined,
  });
});

// ─── Deliverable submitted → notify task creator ─────────────────────

on(EventTypes.DELIVERABLE_SUBMITTED, async (e) => {
  const [userId, workspaceId] = await Promise.all([
    getTaskCreatorUserId(e.taskId),
    getTaskWorkspaceId(e.taskId),
  ]);
  if (!userId) return;
  await notify({
    userId,
    type: NotificationKind.DELIVERABLE_SUBMITTED,
    title: `Deliverable: ${e.title}`,
    body: `${e.agentName} submitted "${e.title}" for "${e.taskTitle}".`,
    taskId: e.taskId,
    url: taskUrl(e.taskId, e.taskNumber),
    workspaceId: workspaceId ?? undefined,
  });
});

// ─── Document created on task → notify task creator ──────────────────

on(EventTypes.DOCUMENT_CREATED, async (e) => {
  if (!e.taskId) return;

  const [creatorUserId, workspaceId] = await Promise.all([
    getTaskCreatorUserId(e.taskId),
    getTaskWorkspaceId(e.taskId),
  ]);
  if (!creatorUserId) return;

  // Don't notify if the document author is the task creator
  const authorUserIds = e.profileId ? await getUserIdsFromProfileIds([e.profileId]) : [];
  if (authorUserIds.includes(creatorUserId)) return;

  await notify({
    userId: creatorUserId,
    type: NotificationKind.DOCUMENT_ADDED,
    title: `New ${e.docType}: ${e.title}`,
    body: `${e.creatorName} added ${e.docType} "${e.title}" to "${e.taskTitle}".`,
    taskId: e.taskId,
    url: taskUrl(e.taskId),
    workspaceId: workspaceId ?? undefined,
  });
});

// ─── Project member added → notify human project members ─────────────

on(EventTypes.PROJECT_MEMBER_ADDED, async (e) => {
  const [humanUserIds, workspaceId] = await Promise.all([
    getProjectHumanUserIdsByProjectId(e.projectId),
    getProjectWorkspaceId(e.projectId),
  ]);
  if (!humanUserIds.length) return;

  await Promise.allSettled(
    humanUserIds.map((userId) =>
      notify({
        userId,
        type: NotificationKind.TEAM_UPDATE,
        title: `New team member: ${e.agentName}`,
        body: `${e.agentName} joined project "${e.projectName}".`,
        url: `/projects/${e.projectId}`,
        workspaceId: workspaceId ?? undefined,
      }),
    ),
  );
});

// ─── Project member removed → notify human project members ───────────

on(EventTypes.PROJECT_MEMBER_REMOVED, async (e) => {
  const [humanUserIds, workspaceId] = await Promise.all([
    getProjectHumanUserIdsByProjectId(e.projectId),
    getProjectWorkspaceId(e.projectId),
  ]);
  if (!humanUserIds.length) return;

  await Promise.allSettled(
    humanUserIds.map((userId) =>
      notify({
        userId,
        type: NotificationKind.TEAM_UPDATE,
        title: `Team member left: ${e.agentName}`,
        body: `${e.agentName} was removed from project "${e.projectName}".`,
        url: `/projects/${e.projectId}`,
        workspaceId: workspaceId ?? undefined,
      }),
    ),
  );
});
