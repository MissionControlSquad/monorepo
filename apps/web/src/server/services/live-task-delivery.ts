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

const MAX_MESSAGE_BYTES = 4096;

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
  kind: "mention" | "inbox_task" | "review_needed";
  content: string;
  taskId?: string;
  messageId?: string;
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
      connectionRegistry.send(connection.id, {
        type: "mc.notify",
        agentSlug: slug,
        kind: opts.kind,
        content: opts.content,
        taskId: opts.taskId,
        messageId: opts.messageId,
      });
    } catch {
      // swallow — notifications are best-effort
    }
  }
}

/**
 * Live push for @mention events.
 * Called after notification.ts creates the Notification DB record.
 * agentIds = the mentionedAgentIds from the MESSAGE_CREATED event.
 */
export async function tryDeliverMentionNotification(
  agentIds: string[],
  opts: { fromName: string; taskTitle: string; taskId: string; messageId?: string },
): Promise<void> {
  if (!agentIds.length) return;
  await sendNotifyToAgents(agentIds, {
    kind: "mention",
    content: `${opts.fromName} mentioned you in task "${opts.taskTitle.slice(0, 200)}" (task ID: ${opts.taskId}). Check the task, respond if needed, and follow your PLAYBOOK.`,
    taskId: opts.taskId,
    messageId: opts.messageId,
  });
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
    // Find all profiles that are active members of the project
    const members = await prisma.projectMember
      .findMany({
        where: { projectId, status: "active" },
        select: { profile: { select: { agentId: true, kind: true } } },
      })
      .catch(() => []);

    agentIds = members
      .filter((m) => m.profile?.kind === "agent" && m.profile?.agentId)
      .map((m) => m.profile!.agentId as string)
      .filter((id) => !excludeAgentIds.includes(id));
  } else {
    // No project scope — avoid broadcasting to all agents (too noisy).
    // Heartbeat handles global inbox visibility. Only project-scoped inbox gets live push.
    return;
  }

  if (!agentIds.length) return;

  await sendNotifyToAgents(agentIds, {
    kind: "inbox_task",
    content: `New task in inbox: "${taskTitle.slice(0, 200)}" (task ID: ${taskId}). Check the inbox and pick it up if appropriate per your PLAYBOOK.`,
    taskId,
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
      where: { projectId, status: "active" },
      select: { profile: { select: { agentId: true, kind: true } } },
    })
    .catch(() => []);

  const agentIds = members
    .filter((m) => m.profile?.kind === "agent" && m.profile?.agentId)
    .map((m) => m.profile!.agentId as string);

  if (!agentIds.length) return;

  // Filter to squad leads only
  const squadLeads = await prisma.agent
    .findMany({
      where: { id: { in: agentIds }, role: "Squad Lead" },
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
