import { on } from "../bus";
import { pubsub, PubSubEvent, activityProjectTopic } from "../../pubsub";
import { EventTypes, TaskStatus } from "../../constants";
import { taskModel, activityModel } from "../../models";
import { getOrCreateAgentProfileId } from "../../agent-profile";
import type { ActivityType } from "@prisma/client";

/** Resolve an agentId to a profileId. Returns undefined if resolution fails. */
async function resolveAgentProfile(agentId: string): Promise<string | undefined> {
  try {
    return await getOrCreateAgentProfileId(agentId);
  } catch {
    return undefined;
  }
}

interface LogOptions {
  type: ActivityType;
  message: string;
  profileId?: string;
  taskId?: string;
  metadata?: unknown;
}

async function log(opts: LogOptions) {
  const { type, message, profileId, taskId, metadata } = opts;

  let projectId: string | undefined;
  if (taskId) {
    const task = await taskModel.findById(taskId, {
      select: { projectId: true },
    });
    projectId = task?.projectId ?? undefined;
  }

  const activity = await activityModel.create({
    data: { type, message, profileId, taskId, projectId, metadata: metadata as any },
  });
  const actPayload = { activityId: activity.id, projectId: activity.projectId ?? undefined };
  if (activity.projectId) pubsub.publish(activityProjectTopic(activity.projectId), actPayload);
  pubsub.publish(PubSubEvent.ACTIVITY.CREATED, actPayload);
  return activity;
}

on(EventTypes.AGENT_WOKE_UP, async (e) => {
  if (e.type !== EventTypes.AGENT_WOKE_UP) return;
  const profileId = await resolveAgentProfile(e.agentId);
  await log({ type: "agent_woke_up", message: `${e.agentName} woke up`, profileId });
});

on(EventTypes.AGENT_WENT_TO_SLEEP, async (e) => {
  if (e.type !== EventTypes.AGENT_WENT_TO_SLEEP) return;
  const profileId = await resolveAgentProfile(e.agentId);
  await log({ type: "agent_went_to_sleep", message: `${e.agentName} went to sleep`, profileId });
});

on(EventTypes.AGENT_STATUS_CHANGED, async (e) => {
  if (e.type !== EventTypes.AGENT_STATUS_CHANGED) return;
  const profileId = await resolveAgentProfile(e.agentId);
  const detail = e.toDetailedStatus ? ` (${e.toDetailedStatus})` : "";
  await log({
    type: "agent_status_changed",
    message: `${e.agentName} changed status: ${e.fromStatus} → ${e.toStatus}${detail}`,
    profileId,
    metadata: { fromStatus: e.fromStatus, toStatus: e.toStatus },
  });
});

/** Direct status updates (cron auto-sleep, deactivate) — so history/activity stay in sync */
on(EventTypes.AGENT_STATUS_APPLIED, async (e) => {
  if (e.type !== EventTypes.AGENT_STATUS_APPLIED) return;
  const profileId = await resolveAgentProfile(e.agentId);
  const detail = e.toDetailedStatus ? ` (${e.toDetailedStatus})` : "";
  const message =
    e.toStatus === "idle"
      ? `${e.agentName} went to sleep`
      : `${e.agentName} changed status: ${e.fromStatus} → ${e.toStatus}${detail}`;
  await log({
    type: e.toStatus === "idle" ? "agent_went_to_sleep" : "agent_status_changed",
    message,
    profileId,
    metadata: { fromStatus: e.fromStatus, toStatus: e.toStatus },
  });
});

on(EventTypes.AGENT_JOINED, async (e) => {
  if (e.type !== EventTypes.AGENT_JOINED) return;
  const profileId = await resolveAgentProfile(e.agentId);
  await log({ type: "agent_status_changed", message: `${e.agentName} joined the team`, profileId });
});

on(EventTypes.TASK_CREATED, async (e) => {
  if (e.type !== EventTypes.TASK_CREATED) return;
  const num = e.taskNumber ? ` #${e.taskNumber}` : "";
  const by = e.creatorName ? ` by ${e.creatorName}` : " from dashboard";
  const profileId =
    e.profileId ?? (e.createdBy ? await resolveAgentProfile(e.createdBy) : undefined);
  await log({
    type: "task_created",
    message: `Task${num} "${e.title}" created${by}`,
    profileId,
    taskId: e.taskId,
  });
});

on(EventTypes.TASK_STATUS_CHANGED, async (e) => {
  if (e.type !== EventTypes.TASK_STATUS_CHANGED) return;
  const num = e.taskNumber ? ` #${e.taskNumber}` : "";
  const type =
    e.toStatus === TaskStatus.DONE ? ("task_completed" as const) : ("task_updated" as const);
  const profileId =
    e.profileId ?? (e.changedBy ? await resolveAgentProfile(e.changedBy) : undefined);
  await log({
    type,
    message: `Task${num} "${e.title}": ${e.fromStatus} → ${e.toStatus}`,
    profileId,
    taskId: e.taskId,
    metadata: { changes: [{ field: "status", from: e.fromStatus, to: e.toStatus }] },
  });
});

on(EventTypes.TASK_ASSIGNEES_CHANGED, async (e) => {
  if (e.type !== EventTypes.TASK_ASSIGNEES_CHANGED) return;
  const parts: string[] = [];
  if (e.addedNames.length) parts.push(`+${e.addedNames.join(", ")}`);
  if (e.removedNames.length) parts.push(`-${e.removedNames.join(", ")}`);
  await log({
    type: "task_assigned",
    message: `Task "${e.title}" assignees: ${parts.join("; ")}`,
    profileId: e.profileId,
    taskId: e.taskId,
    metadata: { changes: [{ field: "assignees", added: e.addedNames, removed: e.removedNames }] },
  });
});

/** Human-readable label for a camelCase field name */
function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: "title",
    description: "description",
    priority: "priority",
    dueDate: "due date",
    tags: "tags",
    parentTaskId: "parent task",
    blockedByTaskId: "blocked by",
  };
  return labels[field] ?? field;
}

/** Format a field value for display in the activity message */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") {
    // Try to parse as date
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return value.length > 60 ? `${value.substring(0, 60)}…` : value;
  }
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.join(", ");
  return String(value);
}

on(EventTypes.TASK_FIELDS_UPDATED, async (e) => {
  if (e.type !== EventTypes.TASK_FIELDS_UPDATED) return;
  const num = e.taskNumber ? ` #${e.taskNumber}` : "";
  let message: string;
  if (e.changes && e.changes.length > 0) {
    const parts = e.changes.map(
      (c) => `${fieldLabel(c.field)}: ${formatValue(c.from)} → ${formatValue(c.to)}`,
    );
    message = `Task${num} "${e.title}": ${parts.join(", ")}`;
  } else {
    message = `Task${num} "${e.title}" updated`;
  }
  await log({
    type: "task_updated",
    message,
    profileId: e.profileId,
    taskId: e.taskId,
    metadata: e.changes ? { changes: e.changes } : undefined,
  });
});

on(EventTypes.TASK_DELETED, async (e) => {
  if (e.type !== EventTypes.TASK_DELETED) return;
  const profileId = e.profileId ?? (await resolveAgentProfile(e.agentId));
  await log({
    type: "task_updated",
    message: `Task "${e.title}" deleted by ${e.agentName}`,
    profileId,
    taskId: e.taskId,
  });
});

on(EventTypes.TASK_APPROVED, async (e) => {
  if (e.type !== EventTypes.TASK_APPROVED) return;
  const profileId = await resolveAgentProfile(e.reviewerId);
  await log({
    type: "task_completed",
    message: `Task "${e.title}" approved by ${e.reviewerName}`,
    profileId,
    taskId: e.taskId,
    metadata: { eventType: EventTypes.TASK_APPROVED },
  });
});

on(EventTypes.TASK_REJECTED, async (e) => {
  if (e.type !== EventTypes.TASK_REJECTED) return;
  const profileId = await resolveAgentProfile(e.reviewerId);
  await log({
    type: "task_updated",
    message: `Task "${e.title}" rejected by ${e.reviewerName}: ${e.rejectionReason}`,
    profileId,
    taskId: e.taskId,
    metadata: { eventType: EventTypes.TASK_REJECTED },
  });
});

on(EventTypes.TASK_CLARIFICATION_REQUESTED, async (e) => {
  if (e.type !== EventTypes.TASK_CLARIFICATION_REQUESTED) return;
  const profileId = await resolveAgentProfile(e.reviewerId);
  await log({
    type: "task_updated",
    message: `Clarification requested on "${e.title}" by ${e.reviewerName}`,
    profileId,
    taskId: e.taskId,
    metadata: { eventType: EventTypes.TASK_CLARIFICATION_REQUESTED },
  });
});

on(EventTypes.MESSAGE_CREATED, async (e) => {
  if (e.type !== EventTypes.MESSAGE_CREATED) return;
  await log({
    type: "message_sent",
    message: `${e.fromAgentName} commented on "${e.taskTitle}"`,
    profileId: e.fromProfileId,
    taskId: e.taskId,
  });
});

on(EventTypes.DOCUMENT_CREATED, async (e) => {
  if (e.type !== EventTypes.DOCUMENT_CREATED) return;
  const taskRef = e.taskTitle ? ` for "${e.taskTitle}"` : "";
  const profileId = e.profileId ?? (await resolveAgentProfile(e.createdBy));
  await log({
    type: "document_created",
    message: `${e.creatorName} created ${e.docType} "${e.title}"${taskRef}`,
    profileId,
    taskId: e.taskId,
  });
});

on(EventTypes.QUEUE_ITEM_CREATED, async (e) => {
  if (e.type !== EventTypes.QUEUE_ITEM_CREATED) return;
  const profileId = await resolveAgentProfile(e.agentId);
  await log({
    type: "task_updated",
    message: `${e.agentName} added queue item: "${e.title}"`,
    profileId,
  });
});

on(EventTypes.QUEUE_ITEM_STATUS_CHANGED, async (e) => {
  if (e.type !== EventTypes.QUEUE_ITEM_STATUS_CHANGED) return;
  const profileId = await resolveAgentProfile(e.agentId);
  await log({
    type: "task_updated",
    message: `${e.agentName} queue item "${e.title}" → ${e.newStatus}`,
    profileId,
  });
});

on(EventTypes.DELIVERABLE_SUBMITTED, async (e) => {
  if (e.type !== EventTypes.DELIVERABLE_SUBMITTED) return;
  const verb = e.isRevision ? "revised" : "submitted";
  await log({
    type: "deliverable_submitted",
    message: `${e.agentName} ${verb} ${e.kind} "${e.title}" for "${e.taskTitle}"`,
    profileId: e.profileId,
    taskId: e.taskId,
  });
});
