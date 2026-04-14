/** @agentcenter/database - Agent action logging. */

import { prisma } from "../client";
import { AgentActionType, Prisma } from "@prisma/client";

export interface LogAgentActionInput {
  agentId: string;
  taskId: string;
  actionType: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an agent action log entry.
 * Returns the created action or null on failure.
 */
export async function logAgentAction(
  input: LogAgentActionInput,
): Promise<{ id: string } | null> {
  return prisma.agentAction
    .create({
      data: {
        agentId: input.agentId,
        taskId: input.taskId,
        actionType: input.actionType as AgentActionType,
        description: input.description,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    .catch(() => null);
}
