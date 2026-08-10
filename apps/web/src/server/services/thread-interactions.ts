/**
 * Typed thread interactions service (Domain 8 G6.5). Agents create structured asks on a task thread
 * (suggest_tasks / ask_user_questions / request_confirmation); humans resolve or dismiss them. The
 * kind/status vocabulary + transition rule are pure (@agentcenter/utils); this owns persistence.
 */
import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";
import type { TaskThreadInteraction, Prisma } from "@agentcenter/database";
import { isThreadInteractionKind, canResolveThreadInteraction } from "@agentcenter/utils";
import { badRequest } from "./service-errors";

export async function createThreadInteraction(input: {
  taskId: string;
  kind: string;
  payload: Prisma.InputJsonValue;
  sourceMessageId?: string | null;
  sourceRunId?: string | null;
  createdByProfileId?: string | null;
}): Promise<TaskThreadInteraction> {
  if (!isThreadInteractionKind(input.kind)) badRequest(`Unknown interaction kind: ${input.kind}`);
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, deletedAt: null },
    select: { id: true },
  });
  if (!task) throw new GraphQLError("Task not found", { extensions: { code: "NOT_FOUND" } });
  return prisma.taskThreadInteraction.create({
    data: {
      taskId: input.taskId,
      kind: input.kind,
      payload: input.payload,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceRunId: input.sourceRunId ?? null,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}

export function listThreadInteractions(
  taskId: string,
  status?: string | null,
): Promise<TaskThreadInteraction[]> {
  return prisma.taskThreadInteraction.findMany({
    where: { taskId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Resolve (or dismiss) a pending interaction, attaching an optional result payload. Only a pending
 * interaction can transition. Returns the updated row.
 */
export async function resolveThreadInteraction(input: {
  id: string;
  decision: "resolved" | "dismissed";
  result?: Prisma.InputJsonValue | null;
  resolvedByProfileId: string;
}): Promise<TaskThreadInteraction> {
  const existing = await prisma.taskThreadInteraction.findUnique({
    where: { id: input.id },
    select: { id: true, status: true },
  });
  if (!existing)
    throw new GraphQLError("Interaction not found", { extensions: { code: "NOT_FOUND" } });
  if (!canResolveThreadInteraction(existing.status, input.decision))
    badRequest(`Interaction is ${existing.status} and cannot be ${input.decision}`);

  return prisma.taskThreadInteraction.update({
    where: { id: input.id },
    data: {
      status: input.decision,
      result: (input.result ?? undefined) as Prisma.InputJsonValue | undefined,
      resolvedByProfileId: input.resolvedByProfileId,
      resolvedAt: new Date(),
    },
  });
}
