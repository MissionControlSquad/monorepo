/**
 * live-task-delivery.ts
 *
 * Attempts to deliver a newly-assigned task to agents via the Live Gateway.
 * This is a purely additive fast path — existing heartbeat handling is untouched.
 *
 * Rules:
 *  - Never throws. All errors are swallowed — must not affect the task API response.
 *  - If no live connection exists for an agent → return silently (heartbeat handles it).
 *  - If connection exists but offline → enqueue in LivePendingDelivery (drained on reconnect).
 *  - If connection is live → enqueue first (idempotency) then send WS frame.
 *  - Delivery is only marked as received when plugin sends vm.task_ack (in handler).
 */

import { findConnectionByAgentSlug, enqueuePendingDelivery } from "@agentcenter/database";
import { connectionRegistry } from "./live-connection-registry";
import { LIVE_GATEWAY } from "@agentcenter/types";

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

  // Load agent usernames — username is the slug used by the plugin
  const agents = await prisma.agent
    .findMany({
      where: { id: { in: agentIds } },
      select: { id: true, username: true, name: true },
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

      const isLive = connectionRegistry.send(connection.id, {
        type: "mc.deliver_task",
        deliveryId: delivery.id,
        agentSlug: slug,
        taskId: opts.taskId,
        message,
        priority: opts.priority as any,
      });

      if (!isLive) {
        // VM was in registry but WS closed — delivery stays queued, will drain on reconnect
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
