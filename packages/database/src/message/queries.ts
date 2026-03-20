/** @agentcenter/database - Message Operations
 * Cursor-based pagination helpers for task messages.
 */

import { prisma } from "../client";

const DEFAULT_INCLUDE = {
  fromProfile: true,
  task: true,
  attachments: { include: { document: true } },
  mentions: { include: { profile: true } },
  reactions: { include: { profile: true } },
};

/** Get the createdAt cursor for a message (for pagination). */
export async function getMessageCursor(taskId: string, beforeId: string) {
  return prisma.message.findFirst({
    where: { id: beforeId, taskId },
    select: { createdAt: true },
  });
}

/** List messages older than a given cursor date for a task. */
export async function listMessagesBeforeCursor(
  taskId: string,
  beforeCreatedAt: Date,
  take: number,
  include = DEFAULT_INCLUDE,
) {
  return prisma.message.findMany({
    where: { taskId, createdAt: { lt: beforeCreatedAt } },
    orderBy: { createdAt: "desc" },
    take,
    include: include as any,
  });
}

/** List latest messages for a task (newest first). */
export async function listLatestMessages(
  taskId: string,
  take: number,
  include = DEFAULT_INCLUDE,
) {
  return prisma.message.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    take,
    include: include as any,
  });
}
