/**
 * live-task-delivery.ts
 *
 * Delivers a task to cloudVM agents via the Live Gateway.
 * If the VM is connected, sends directly. Otherwise queues for when it reconnects.
 */

import { enqueuePendingTask } from "@agentcenter/database";
import { vmLiveRegistry } from "./vm-live-registry";
import { LIVE_GATEWAY } from "@agentcenter/types";

interface DeliverOptions {
  taskId: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  assignedBy?: string;
}

/**
 * Deliver a task to all cloudVM agents with the given agentIds.
 * Agents not on a VM are silently skipped (handled by existing heartbeat flow).
 */
export async function deliverTaskToCloudVMAgents(
  agentIds: string[],
  opts: DeliverOptions,
): Promise<void> {
  if (!agentIds.length) return;

  const { prisma } = await import("../prisma");

  // Load agents with their VM relationship
  const agents = await prisma.agent.findMany({
    where: {
      id: { in: agentIds },
      hostingType: "cloudVM",
      cloudVmId: { not: null },
    },
    select: {
      id: true,
      username: true,
      name: true,
      cloudVmId: true,
    },
  });

  for (const agent of agents) {
    if (!agent.cloudVmId) continue;
    const slug = agent.username ?? agent.name;
    const message = buildTaskMessage(opts);
    const idempotencyKey = `task:${opts.taskId}:agent:${agent.id}`;
    const expiresAt = new Date(Date.now() + LIVE_GATEWAY.TASK_DELIVERY_TTL_MS);

    const conn = vmLiveRegistry.get(agent.cloudVmId);

    if (conn && conn.ws.readyState === 1 /* OPEN */) {
      // VM is live — queue first (idempotency), then deliver directly
      const delivery = await enqueuePendingTask({
        vmId: agent.cloudVmId,
        agentSlug: slug,
        taskId: opts.taskId,
        message,
        priority: opts.priority,
        idempotencyKey,
        expiresAt,
      });

      if (delivery) {
        vmLiveRegistry.send(agent.cloudVmId, {
          type: "mc.deliver_task",
          deliveryId: delivery.id,
          agentSlug: slug,
          taskId: opts.taskId,
          message,
          priority: opts.priority as any,
        });
        // Plugin will send vm.task_ack → handleTaskAck marks delivery as received.
        // Do NOT mark delivered here — if the WS send fails the record stays pending
        // and will be drained on next connect.
      }
    } else {
      // VM offline — queue for drain on next connect
      await enqueuePendingTask({
        vmId: agent.cloudVmId,
        agentSlug: slug,
        taskId: opts.taskId,
        message,
        priority: opts.priority,
        idempotencyKey,
        expiresAt,
      });
    }
  }
}

const MAX_MESSAGE_BYTES = 4096;

function buildTaskMessage(opts: DeliverOptions): string {
  const lines = [`You have been assigned a new task: "${opts.taskTitle.slice(0, 200)}"`];
  if (opts.taskDescription) {
    lines.push("", opts.taskDescription.slice(0, 1000));
  }
  if (opts.assignedBy) {
    lines.push("", `Assigned by: ${opts.assignedBy.slice(0, 100)}`);
  }
  const msg = lines.join("\n");
  // Hard cap to prevent oversized WS frames
  return msg.length > MAX_MESSAGE_BYTES ? msg.slice(0, MAX_MESSAGE_BYTES) : msg;
}
