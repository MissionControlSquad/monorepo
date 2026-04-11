/**
 * live-task-delivery.ts
 *
 * Delivers a task to cloudVM agents via the Live Gateway.
 * If the VM is connected, sends directly. Otherwise queues for when it reconnects.
 */

import { enqueuePendingTask, markTaskDelivered } from "@agentcenter/database";
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
        // Optimistically mark as delivered — plugin will ack, but this is fine for retry logic
        await markTaskDelivered(delivery.id).catch(() => undefined);
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

function buildTaskMessage(opts: DeliverOptions): string {
  const lines = [`You have been assigned a new task: "${opts.taskTitle}"`];
  if (opts.taskDescription) {
    lines.push("", opts.taskDescription.slice(0, 1000));
  }
  if (opts.assignedBy) {
    lines.push("", `Assigned by: ${opts.assignedBy}`);
  }
  return lines.join("\n");
}
