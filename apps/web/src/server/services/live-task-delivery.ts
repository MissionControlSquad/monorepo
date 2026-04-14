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

import { findConnectionByAgentSlug, enqueuePendingDelivery } from "@agentcenter/database";
import { connectionRegistry } from "./live-connection-registry";
import { LIVE_GATEWAY } from "@agentcenter/types";
import { MAX_MESSAGE_BYTES } from "@agentcenter/utils";
import {
  Roles,
  ProfileKind,
  ProjectMemberStatus,
  SetupStatus,
  ChannelVisibility,
} from "../constants";

/** Same threshold as heartbeat-preflight overlapping check. */
const OVERLAPPING_TTL_MS = 5 * 60 * 1000;

function isAgentBusy(agent: { currentTaskId: string | null; lastHeartbeat: Date | null }): boolean {
  return (
    !!agent.currentTaskId &&
    !!agent.lastHeartbeat &&
    Date.now() - new Date(agent.lastHeartbeat).getTime() < OVERLAPPING_TTL_MS
  );
}

interface DeliverOptions {
  taskId: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  assignedBy?: string;
}

function buildTaskMessage(opts: DeliverOptions): string {
  // Task ID is included so the agent can call MC APIs (status updates, action logs, etc.)
  // without it the agent cannot follow PLAYBOOK — it would have no ID to reference.
  const lines = [
    `You have been assigned a new task (task ID: ${opts.taskId}): "${opts.taskTitle.slice(0, 200)}"`,
  ];
  if (opts.taskDescription) {
    lines.push("", opts.taskDescription.slice(0, 1000));
  }
  if (opts.assignedBy) {
    lines.push("", `Assigned by: ${opts.assignedBy.slice(0, 100)}`);
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

  const { prisma } = await import("../prisma");

  // Load agent usernames + busy state (mirrors heartbeat-preflight overlapping check)
  const agents = await prisma.agent
    .findMany({
      where: { id: { in: agentIds } },
      select: { id: true, username: true, name: true, currentTaskId: true, lastHeartbeat: true },
    })
    .catch(() => []);

  for (const agent of agents) {
    const slug = agent.username ?? agent.name;
    if (!slug) continue;

    try {
      const connection = await findConnectionByAgentSlug(slug);
      if (!connection) continue; // no live route for this agent — heartbeat handles it

      const idempotencyKey = `task:${opts.taskId}:agent:${slug}`;
      const expiresAt = new Date(Date.now() + LIVE_GATEWAY.TASK_DELIVERY_TTL_MS);
      const message = buildTaskMessage(opts);

      // Always enqueue — task must never be lost regardless of agent state.
      const delivery = await enqueuePendingDelivery({
        connectionId: connection.id,
        agentSlug: slug,
        taskId: opts.taskId,
        message,
        priority: opts.priority,
        idempotencyKey,
        expiresAt,
      });

      if (!delivery) continue; // already queued (idempotency key collision)

      // Overlapping guard: agent already working on something → do not interrupt.
      // The task sits in LivePendingDelivery and is drained when the agent goes idle
      // (vm.hello reconnect drain) or the heartbeat catches hasAssignedTasks.
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
        // WS closed since registry entry was added — delivery stays queued, drains on reconnect
        console.debug(
          `[live-delivery] Connection ${connection.id} not live — task ${opts.taskId} queued`,
        );
      }
      // vm.task_ack → handleTaskAck will call markDeliveryReceived (never mark here)
    } catch (err) {
      console.error(`[live-delivery] Failed to deliver task ${opts.taskId} to agent ${slug}:`, err);
    }
  }
}

// ─── Notification delivery (fire-and-forget, no ack, no DB queue) ─────────────
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

  const { prisma } = await import("../prisma");

  const agents = await prisma.agent
    .findMany({
      where: { id: { in: agentIds } },
      select: { username: true, name: true, currentTaskId: true, lastHeartbeat: true },
    })
    .catch(() => []);

  for (const agent of agents) {
    const slug = agent.username ?? agent.name;
    if (!slug) continue;

    // Overlapping guard: agent is busy → skip notification entirely.
    // Heartbeat catches it when the agent goes idle (undeliveredMentions,
    // hasInboxTasks, hasPendingReview). Unlike task delivery, notifications
    // have no DB queue — the heartbeat IS the queue.
    if (isAgentBusy(agent)) continue;

    try {
      const connection = await findConnectionByAgentSlug(slug);
      if (!connection) continue; // offline — heartbeat handles it
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

/**
 * Live push for @mention events.
 * Called after notification.ts creates the Notification DB record.
 * agentIds = the mentionedAgentIds from the MESSAGE_CREATED event.
 *
 * Splits agents into assigned vs unassigned so each group receives
 * appropriate instructions:
 *  - Assigned agents: full PLAYBOOK instruction (they own the task).
 *  - Unassigned agents: read/reply only (no ownership — just a heads-up).
 */
export async function tryDeliverMentionNotification(
  agentIds: string[],
  opts: { fromName: string; taskTitle: string; taskId: string; messageId?: string },
): Promise<void> {
  if (!agentIds.length) return;

  const { prisma } = await import("../prisma");

  // Find which of the mentioned agents are actually assigned to this task.
  const assignments = await prisma.taskAssignee
    .findMany({
      where: { taskId: opts.taskId, profile: { agentId: { in: agentIds } } },
      select: { profile: { select: { agentId: true } } },
    })
    .catch(() => []);

  const assignedSet = new Set(
    assignments.map((a) => a.profile?.agentId).filter(Boolean) as string[],
  );

  const assignedIds = agentIds.filter((id) => assignedSet.has(id));
  const unassignedIds = agentIds.filter((id) => !assignedSet.has(id));

  // Assigned agents: full PLAYBOOK context — they are expected to act on this task.
  if (assignedIds.length) {
    await sendNotifyToAgents(assignedIds, {
      kind: "mention",
      content: `${opts.fromName} mentioned you in task "${opts.taskTitle.slice(0, 200)}" (task ID: ${opts.taskId}). Check the message and respond if needed, then continue your PLAYBOOK for this task.`,
      taskId: opts.taskId,
      messageId: opts.messageId,
    });
  }

  // Unassigned agents: read/reply only — they are not responsible for the task.
  if (unassignedIds.length) {
    await sendNotifyToAgents(unassignedIds, {
      kind: "mention",
      content: `${opts.fromName} mentioned you in task "${opts.taskTitle.slice(0, 200)}" (task ID: ${opts.taskId}). You are not assigned to this task — read the message and reply if needed via POST /api/tasks/${opts.taskId}/messages. Do not take ownership or run your task PLAYBOOK.`,
      taskId: opts.taskId,
      messageId: opts.messageId,
    });
  }
}

/**
 * Live push for new inbox tasks.
 * Notifies all active agent members of the task's project (or all agents if no project).
 * Skips agents who were explicitly assigned — they already get mc.deliver_task.
 */
export async function tryDeliverInboxTaskNotification(
  taskId: string,
  projectId: string | null,
  taskTitle: string,
  excludeAgentIds: string[] = [],
): Promise<void> {
  const { prisma } = await import("../prisma");

  let agentIds: string[];

  if (projectId) {
    // Find squad lead agents who are active members of the project.
    // Regular members don't need to act on unassigned inbox tasks —
    // squad leads triage and assign them, triggering the normal assignment flow.
    const members = await prisma.projectMember
      .findMany({
        where: { projectId, status: ProjectMemberStatus.ACTIVE },
        select: { profile: { select: { agentId: true, kind: true } } },
      })
      .catch(() => []);

    const projectAgentIds = members
      .filter((m) => m.profile?.kind === ProfileKind.AGENT && m.profile?.agentId)
      .map((m) => m.profile!.agentId as string)
      .filter((id) => !excludeAgentIds.includes(id));

    if (!projectAgentIds.length) {
      agentIds = [];
    } else {
      const squadLeads = await prisma.agent
        .findMany({
          where: { id: { in: projectAgentIds }, role: Roles.SQUAD_LEAD },
          select: { id: true },
        })
        .catch(() => []);
      agentIds = squadLeads.map((a) => a.id);
    }
  } else {
    // No project scope — only squad leads handle unassigned/unscoped tasks.
    // Once they assign to specific agents the normal assignment flow takes over.
    const squadLeads = await prisma.agent
      .findMany({
        where: { setupStatus: SetupStatus.ACTIVE, role: Roles.SQUAD_LEAD },
        select: { id: true },
      })
      .catch(() => []);

    agentIds = squadLeads.map((a) => a.id).filter((id) => !excludeAgentIds.includes(id));
  }

  if (!agentIds.length) return;

  await sendNotifyToAgents(agentIds, {
    kind: "inbox_task",
    content: `New task in inbox: "${taskTitle.slice(0, 200)}" (task ID: ${taskId}). Check the inbox and pick it up if appropriate per your PLAYBOOK.`,
    taskId,
  });
}

/**
 * Live push when a task moves to "done".
 * Looks up current assignees from the DB and notifies them.
 */
export async function tryDeliverTaskDoneNotification(
  taskId: string,
  taskTitle: string,
): Promise<void> {
  const { prisma } = await import("../prisma");

  const assignments = await prisma.taskAssignee
    .findMany({
      where: { taskId },
      select: { profile: { select: { agentId: true } } },
    })
    .catch(() => []);

  const agentIds = assignments.map((a) => a.profile?.agentId).filter(Boolean) as string[];
  if (!agentIds.length) return;

  await sendNotifyToAgents(agentIds, {
    kind: "task_approved",
    content: `Task "${taskTitle.slice(0, 200)}" (task ID: ${taskId}) is now done. Update your records per your PLAYBOOK.`,
    taskId,
  });
}

/**
 * Live push when a task is approved.
 * Notifies the assignees so they can update their internal state.
 */
export async function tryDeliverTaskApprovedNotification(
  agentIds: string[],
  opts: { taskTitle: string; taskId: string; reviewerName: string },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: "task_approved",
    content: `Your task "${opts.taskTitle.slice(0, 200)}" (task ID: ${opts.taskId}) was approved by ${opts.reviewerName}. Mark it complete in your records per your PLAYBOOK.`,
    taskId: opts.taskId,
  });
}

/**
 * Live push when a task is rejected.
 * Notifies the assignees so they can begin rework immediately.
 */
export async function tryDeliverTaskRejectedNotification(
  agentIds: string[],
  opts: { taskTitle: string; taskId: string; reviewerName: string; rejectionReason: string },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: "task_rejected",
    content: `Your task "${opts.taskTitle.slice(0, 200)}" (task ID: ${opts.taskId}) was rejected by ${opts.reviewerName}: ${opts.rejectionReason.slice(0, 500)}. Rework and resubmit per your PLAYBOOK.`,
    taskId: opts.taskId,
  });
}

/**
 * Live push when clarification is requested on a task.
 * Notifies the assignees so they can respond immediately.
 */
export async function tryDeliverClarificationNotification(
  agentIds: string[],
  opts: { taskTitle: string; taskId: string; reviewerName: string; questions: string[] },
): Promise<void> {
  if (!agentIds.length) return;
  const questionText = opts.questions.slice(0, 3).join(" | ").slice(0, 400);
  await sendNotifyToAgents(agentIds, {
    kind: "task_clarification",
    content: `${opts.reviewerName} requested clarification on task "${opts.taskTitle.slice(0, 200)}" (task ID: ${opts.taskId}): ${questionText}. Respond per your PLAYBOOK.`,
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
  if (!projectId) return; // no project — squad leads are project-scoped

  const { prisma } = await import("../prisma");

  // Find squad lead agents in the project
  const members = await prisma.projectMember
    .findMany({
      where: { projectId, status: ProjectMemberStatus.ACTIVE },
      select: { profile: { select: { agentId: true, kind: true } } },
    })
    .catch(() => []);

  const agentIds = members
    .filter((m) => m.profile?.kind === ProfileKind.AGENT && m.profile?.agentId)
    .map((m) => m.profile!.agentId as string);

  if (!agentIds.length) return;

  // Filter to squad leads only
  const squadLeads = await prisma.agent
    .findMany({
      where: { id: { in: agentIds }, role: Roles.SQUAD_LEAD },
      select: { id: true },
    })
    .catch(() => []);

  await sendNotifyToAgents(
    squadLeads.map((a) => a.id),
    {
      kind: "review_needed",
      content: `Task "${taskTitle.slice(0, 200)}" (task ID: ${taskId}) is ready for review. Review it and approve, reject, or request clarification per your PLAYBOOK.`,
      taskId,
    },
  );
}

// ─── Channel / DM notification delivery ──────────────────────────────────────
//
// Fire-and-forget — no DB queue. If the agent is offline the SSE stream or
// next heartbeat handles catch-up. The live push is a fast-path wakeup only.
// Self-message guard: callers must exclude the sending agent's profileId before
// passing agentIds here.

/**
 * Live push when a DM is received by an agent.
 * agentIds = agent members of the DM channel excluding the sender.
 */
export async function tryDeliverDmNotification(
  agentIds: string[],
  opts: {
    channelId: string;
    messageId: string;
    content: string;
    fromHandle: string;
  },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: ChannelVisibility.DM,
    content: `DM from @${opts.fromHandle}: ${opts.content.slice(0, 400)}. Reply via POST /api/channels/${opts.channelId}/messages per your PLAYBOOK.`,
    messageId: opts.messageId,
    channelId: opts.channelId,
    fromHandle: opts.fromHandle,
  });
}

/**
 * Live push when any human or squad member posts a message on a task.
 * Notifies all assigned agents who are NOT the sender so they can respond
 * immediately without waiting for the next heartbeat cycle.
 *
 * agentIds = task assignee agent IDs excluding the message sender.
 */
export async function tryDeliverTaskActivityNotification(
  agentIds: string[],
  opts: { fromName: string; taskTitle: string; taskId: string; messageId: string },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: "task_clarification",
    content: `${opts.fromName} posted a message on task "${opts.taskTitle.slice(0, 200)}" (task ID: ${opts.taskId}). Check the message and respond if needed, then continue your PLAYBOOK.`,
    taskId: opts.taskId,
    messageId: opts.messageId,
  });
}

/**
 * Live push when an agent is @mentioned in a team channel.
 * agentIds = mentioned agent members excluding the sender.
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
    content: `@${opts.fromHandle} mentioned you ${where}: ${opts.content.slice(0, 400)}. Reply via POST /api/channels/${opts.channelId}/messages per your PLAYBOOK.`,
    messageId: opts.messageId,
    channelId: opts.channelId,
    fromHandle: opts.fromHandle,
  });
}
