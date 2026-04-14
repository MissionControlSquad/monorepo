/**
 * live-task-delivery.ts
 *
 * Attempts to deliver a newly-assigned task to agents via the Live Gateway.
 * This is a purely additive fast path — existing heartbeat handling is untouched.
 *
 * Rules:
 *  - Never throws. All errors are swallowed — must not affect the task API response.
 *  - If no live connection exists for an agent → return silently (heartbeat handles it).
 *  - If agent is currently busy (overlapping guard) → enqueue but do NOT push WS frame.
 *    The task stays in LivePendingDelivery and is delivered when the agent goes idle.
 *    Notifications (mentions, inbox, review) are skipped entirely — heartbeat handles them.
 *  - If connection exists but offline → enqueue in LivePendingDelivery (drained on reconnect).
 *  - If connection is live + agent idle → enqueue first (idempotency) then send WS frame.
 *  - Delivery is only marked as received when plugin sends vm.task_ack (in handler).
 *
 * Overlapping guard (mirrors heartbeat-preflight):
 *  agent.currentTaskId set + agent.lastHeartbeat within 5 min → agent is busy → defer.
 */

import {
  findConnectionByAgentSlug,
  enqueuePendingDelivery,
  getTaskAssigneeAgentIds,
  getTaskAssignedSubset,
  getProjectSquadLeadAgentIds,
  getWorkspaceSquadLeadAgentIds,
  getAgentsNotifyState,
} from "@agentcenter/database";
import { connectionRegistry } from "./live-connection-registry";
import { LIVE_GATEWAY } from "@agentcenter/types";
import { MAX_MESSAGE_BYTES, ChannelVisibility } from "@agentcenter/utils";
import { isFeatureEnabled } from "../feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";

// ─── Feature flag guard ───────────────────────────────────────────────────────
// Cached for 60 s (same TTL as feature-flags.ts). Zero DB hits when flag is off.

let _liveGatewayEnabled: boolean | null = null;
let _liveGatewayCheckedAt = 0;
const FLAG_CACHE_MS = 60_000;

async function isLiveGatewayEnabled(): Promise<boolean> {
  if (_liveGatewayEnabled !== null && Date.now() - _liveGatewayCheckedAt < FLAG_CACHE_MS) {
    return _liveGatewayEnabled;
  }
  _liveGatewayEnabled = await isFeatureEnabled(FLAG_KEYS.LIVE_GATEWAY);
  _liveGatewayCheckedAt = Date.now();
  return _liveGatewayEnabled;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Same threshold as heartbeat-preflight overlapping check. */
const OVERLAPPING_TTL_MS = 5 * 60 * 1000;

function isAgentBusy(agent: { currentTaskId: string | null; lastHeartbeat: Date | null }): boolean {
  return (
    !!agent.currentTaskId &&
    !!agent.lastHeartbeat &&
    Date.now() - new Date(agent.lastHeartbeat).getTime() < OVERLAPPING_TTL_MS
  );
}

/** Resolve the gateway slug for an agent (username takes priority over display name). */
function agentSlug(agent: { username: string | null; name: string }): string | null {
  return agent.username ?? agent.name ?? null;
}

/** Truncate a string to at most `max` characters. */
function trunc(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) : str;
}

/** Standard task reference appended to every content string so agents can call MC APIs. */
function taskRef(taskId: string): string {
  return `(task ID: ${taskId})`;
}

// ─── Task delivery (mc.deliver_task, with DB queue + ack) ─────────────────────

interface DeliverOptions {
  taskId: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  assignedBy?: string;
}

function buildTaskMessage(opts: DeliverOptions): string {
  const lines = [
    `You have been assigned a new task ${taskRef(opts.taskId)}: "${trunc(opts.taskTitle, 200)}"`,
  ];
  if (opts.taskDescription) {
    lines.push("", trunc(opts.taskDescription, 1000));
  }
  if (opts.assignedBy) {
    lines.push("", `Assigned by: ${trunc(opts.assignedBy, 100)}`);
  }
  lines.push(
    "",
    "Run your normal work cycle: update your status, complete the task, and report done per your PLAYBOOK.",
  );
  const msg = lines.join("\n");
  return msg.length > MAX_MESSAGE_BYTES ? msg.slice(0, MAX_MESSAGE_BYTES) : msg;
}

/**
 * Called fire-and-forget from the task assignment route.
 * Silently no-ops for agents without a live connection.
 */
export async function tryDeliverTaskToLiveAgents(
  agentIds: string[],
  opts: DeliverOptions,
): Promise<void> {
  if (!agentIds.length) return;
  if (!(await isLiveGatewayEnabled())) return;

  const agents = await getAgentsNotifyState(agentIds);

  for (const agent of agents) {
    const slug = agentSlug(agent);
    if (!slug) continue;

    try {
      const connection = await findConnectionByAgentSlug(slug);
      if (!connection) continue;

      const idempotencyKey = `task:${opts.taskId}:agent:${slug}`;
      const expiresAt = new Date(Date.now() + LIVE_GATEWAY.TASK_DELIVERY_TTL_MS);
      const message = buildTaskMessage(opts);

      const delivery = await enqueuePendingDelivery({
        connectionId: connection.id,
        agentSlug: slug,
        taskId: opts.taskId,
        message,
        priority: opts.priority,
        idempotencyKey,
        expiresAt,
      });

      if (!delivery) continue;

      if (isAgentBusy(agent)) {
        console.debug(
          `[live-delivery] Agent ${slug} is busy — task ${opts.taskId} queued, not pushed`,
        );
        continue;
      }

      const isLive = connectionRegistry.send(connection.id, {
        type: "mc.deliver_task",
        deliveryId: delivery.id,
        agentSlug: slug,
        taskId: opts.taskId,
        message,
        priority: opts.priority as any,
      });

      if (!isLive) {
        console.debug(
          `[live-delivery] Connection ${connection.id} not live — task ${opts.taskId} queued`,
        );
      }
    } catch (err) {
      console.error(`[live-delivery] Failed to deliver task ${opts.taskId} to agent ${slug}:`, err);
    }
  }
}

// ─── Notification delivery (mc.notify, fire-and-forget, no DB queue) ──────────
//
// Unlike task delivery, notifications do NOT use LivePendingDelivery.
// If the agent is offline the heartbeat catches it (undeliveredMentions,
// hasInboxTasks, hasPendingReview). The live push is a fast-path wakeup only.

interface NotifyOptions {
  kind:
    | "mention"
    | "inbox_task"
    | "review_needed"
    | "task_approved"
    | "task_rejected"
    | "task_clarification"
    | "dm"
    | "channel_mention";
  content: string;
  taskId?: string;
  messageId?: string;
  channelId?: string;
  fromHandle?: string;
}

async function sendNotifyToAgents(agentIds: string[], opts: NotifyOptions): Promise<void> {
  if (!agentIds.length) return;
  if (!(await isLiveGatewayEnabled())) return;

  const agents = await getAgentsNotifyState(agentIds);

  for (const agent of agents) {
    const slug = agentSlug(agent);
    if (!slug) continue;

    // Overlapping guard: agent is busy → skip notification entirely.
    // Heartbeat catches it when the agent goes idle (undeliveredMentions,
    // hasInboxTasks, hasPendingReview). Unlike task delivery, notifications
    // have no DB queue — the heartbeat IS the queue.
    if (isAgentBusy(agent)) continue;

    try {
      const connection = await findConnectionByAgentSlug(slug);
      if (!connection) continue;
      const sent = connectionRegistry.send(connection.id, {
        type: "mc.notify",
        agentSlug: slug,
        kind: opts.kind,
        content: opts.content,
        taskId: opts.taskId,
        messageId: opts.messageId,
        channelId: opts.channelId,
        fromHandle: opts.fromHandle,
      });
      if (!sent) {
        console.warn(
          `[live-delivery] Notification "${opts.kind}" not delivered to ${slug} — heartbeat fallback applies`,
        );
      }
    } catch (err) {
      console.error(
        `[live-delivery] Unexpected error delivering "${opts.kind}" to agent ${slug}:`,
        err,
      );
    }
  }
}

// ─── Exported notification functions ─────────────────────────────────────────

/**
 * Live push for @mention events.
 * Splits agents into assigned vs unassigned so each group receives appropriate instructions.
 */
export async function tryDeliverMentionNotification(
  agentIds: string[],
  opts: { fromName: string; taskTitle: string; taskId: string; messageId?: string },
): Promise<void> {
  if (!agentIds.length) return;

  const assignedSet = await getTaskAssignedSubset(opts.taskId, agentIds);
  const assignedIds = agentIds.filter((id) => assignedSet.has(id));
  const unassignedIds = agentIds.filter((id) => !assignedSet.has(id));

  const title = trunc(opts.taskTitle, 200);
  const ref = taskRef(opts.taskId);

  if (assignedIds.length) {
    await sendNotifyToAgents(assignedIds, {
      kind: "mention",
      content: `${opts.fromName} mentioned you in task "${title}" ${ref}. Check the message and respond if needed, then continue your PLAYBOOK for this task.`,
      taskId: opts.taskId,
      messageId: opts.messageId,
    });
  }

  if (unassignedIds.length) {
    await sendNotifyToAgents(unassignedIds, {
      kind: "mention",
      content: `${opts.fromName} mentioned you in task "${title}" ${ref}. You are not assigned to this task — read the message and reply if needed via POST /api/tasks/${opts.taskId}/messages. Do not take ownership or run your task PLAYBOOK.`,
      taskId: opts.taskId,
      messageId: opts.messageId,
    });
  }
}

/**
 * Live push for new inbox tasks.
 * Notifies squad leads of the task's project (or all squad leads if no project).
 */
export async function tryDeliverInboxTaskNotification(
  taskId: string,
  projectId: string | null,
  taskTitle: string,
  excludeAgentIds: string[] = [],
): Promise<void> {
  let agentIds: string[];

  if (projectId) {
    const ids = await getProjectSquadLeadAgentIds(projectId);
    agentIds = ids.filter((id) => !excludeAgentIds.includes(id));
  } else {
    const ids = await getWorkspaceSquadLeadAgentIds();
    agentIds = ids.filter((id) => !excludeAgentIds.includes(id));
  }

  if (!agentIds.length) return;

  await sendNotifyToAgents(agentIds, {
    kind: "inbox_task",
    content: `New task in inbox: "${trunc(taskTitle, 200)}" ${taskRef(taskId)}. Check the inbox and pick it up if appropriate per your PLAYBOOK.`,
    taskId,
  });
}

/**
 * Live push when a task moves to "done".
 */
export async function tryDeliverTaskDoneNotification(
  taskId: string,
  taskTitle: string,
): Promise<void> {
  const agentIds = await getTaskAssigneeAgentIds(taskId);
  if (!agentIds.length) return;

  await sendNotifyToAgents(agentIds, {
    kind: "task_approved",
    content: `Task "${trunc(taskTitle, 200)}" ${taskRef(taskId)} is now done. Update your records per your PLAYBOOK.`,
    taskId,
  });
}

/**
 * Live push when a task is approved.
 */
export async function tryDeliverTaskApprovedNotification(
  agentIds: string[],
  opts: { taskTitle: string; taskId: string; reviewerName: string },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: "task_approved",
    content: `Your task "${trunc(opts.taskTitle, 200)}" ${taskRef(opts.taskId)} was approved by ${opts.reviewerName}. Mark it complete in your records per your PLAYBOOK.`,
    taskId: opts.taskId,
  });
}

/**
 * Live push when a task is rejected.
 */
export async function tryDeliverTaskRejectedNotification(
  agentIds: string[],
  opts: { taskTitle: string; taskId: string; reviewerName: string; rejectionReason: string },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: "task_rejected",
    content: `Your task "${trunc(opts.taskTitle, 200)}" ${taskRef(opts.taskId)} was rejected by ${opts.reviewerName}: ${trunc(opts.rejectionReason, 500)}. Rework and resubmit per your PLAYBOOK.`,
    taskId: opts.taskId,
  });
}

/**
 * Live push when clarification is requested on a task.
 */
export async function tryDeliverClarificationNotification(
  agentIds: string[],
  opts: { taskTitle: string; taskId: string; reviewerName: string; questions: string[] },
): Promise<void> {
  if (!agentIds.length) return;
  const questionText = trunc(opts.questions.slice(0, 3).join(" | "), 400);
  await sendNotifyToAgents(agentIds, {
    kind: "task_clarification",
    content: `${opts.reviewerName} requested clarification on task "${trunc(opts.taskTitle, 200)}" ${taskRef(opts.taskId)}: ${questionText}. Respond per your PLAYBOOK.`,
    taskId: opts.taskId,
  });
}

/**
 * Live push when a task moves to review status.
 * Notifies squad lead agents who are active members of the task's project.
 */
export async function tryDeliverReviewNotification(
  taskId: string,
  projectId: string | null,
  taskTitle: string,
): Promise<void> {
  if (!projectId) return;

  const agentIds = await getProjectSquadLeadAgentIds(projectId);
  if (!agentIds.length) return;

  await sendNotifyToAgents(agentIds, {
    kind: "review_needed",
    content: `Task "${trunc(taskTitle, 200)}" ${taskRef(taskId)} is ready for review. Review it and approve, reject, or request clarification per your PLAYBOOK.`,
    taskId,
  });
}

/**
 * Live push when any human or squad member posts a message on a task.
 * agentIds = task assignee agent IDs excluding the message sender and @mentioned agents.
 */
export async function tryDeliverTaskActivityNotification(
  agentIds: string[],
  opts: { fromName: string; taskTitle: string; taskId: string; messageId: string },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: "task_clarification",
    content: `${opts.fromName} posted a message on task "${trunc(opts.taskTitle, 200)}" ${taskRef(opts.taskId)}. Check the message and respond if needed, then continue your PLAYBOOK.`,
    taskId: opts.taskId,
    messageId: opts.messageId,
  });
}

/**
 * Live push when a document/file is attached to a task.
 */
export async function tryDeliverDocumentNotification(
  taskId: string,
  opts: { creatorName: string; docType: string; docTitle: string; taskTitle: string },
): Promise<void> {
  const agentIds = await getTaskAssigneeAgentIds(taskId);
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: "task_clarification",
    content: `${opts.creatorName} added ${opts.docType} "${trunc(opts.docTitle, 100)}" to task "${trunc(opts.taskTitle, 200)}" ${taskRef(taskId)}. Review the new material and continue your PLAYBOOK.`,
    taskId,
  });
}

/**
 * Live push when a task moves to a status other than REVIEW or DONE.
 */
export async function tryDeliverStatusChangeNotification(
  taskId: string,
  opts: { taskTitle: string; toStatus: string; changedBy?: string },
): Promise<void> {
  const agentIds = await getTaskAssigneeAgentIds(taskId);
  if (!agentIds.length) return;
  const by = opts.changedBy ? ` by ${opts.changedBy}` : "";
  await sendNotifyToAgents(agentIds, {
    kind: "task_clarification",
    content: `Task "${trunc(opts.taskTitle, 200)}" ${taskRef(taskId)} status changed to ${opts.toStatus}${by}. Adjust your work accordingly per your PLAYBOOK.`,
    taskId,
  });
}

/**
 * Live push when a task's fields are updated (title, description, priority, due date, etc.).
 */
export async function tryDeliverTaskFieldsUpdatedNotification(
  taskId: string,
  opts: { taskTitle: string; changedFields: string[] },
): Promise<void> {
  const agentIds = await getTaskAssigneeAgentIds(taskId);
  if (!agentIds.length) return;
  const fields = opts.changedFields.slice(0, 5).join(", ");
  await sendNotifyToAgents(agentIds, {
    kind: "task_clarification",
    content: `Task "${trunc(opts.taskTitle, 200)}" ${taskRef(taskId)} was updated (${fields}). Review the changes and continue your PLAYBOOK with the latest spec.`,
    taskId,
  });
}

// ─── Channel / DM notification delivery ──────────────────────────────────────

/**
 * Live push when a DM is received by an agent.
 */
export async function tryDeliverDmNotification(
  agentIds: string[],
  opts: { channelId: string; messageId: string; content: string; fromHandle: string },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: ChannelVisibility.DM,
    content: `DM from @${opts.fromHandle}: ${trunc(opts.content, 400)}. Reply via POST /api/channels/${opts.channelId}/messages per your PLAYBOOK.`,
    messageId: opts.messageId,
    channelId: opts.channelId,
    fromHandle: opts.fromHandle,
  });
}

/**
 * Live push when an agent is @mentioned in a team channel.
 */
export async function tryDeliverChannelMentionNotification(
  agentIds: string[],
  opts: {
    channelId: string;
    messageId: string;
    content: string;
    fromHandle: string;
    channelName?: string;
  },
): Promise<void> {
  if (!agentIds.length) return;
  const where = opts.channelName ? `in #${opts.channelName}` : "in a channel";
  await sendNotifyToAgents(agentIds, {
    kind: "channel_mention",
    content: `@${opts.fromHandle} mentioned you ${where}: ${trunc(opts.content, 400)}. Reply via POST /api/channels/${opts.channelId}/messages per your PLAYBOOK.`,
    messageId: opts.messageId,
    channelId: opts.channelId,
    fromHandle: opts.fromHandle,
  });
}
