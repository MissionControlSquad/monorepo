/**
 * Tier C: typed task dependency graph. A many-to-many relation between tasks (blocks / relates_to /
 * duplicates), complementing the single blockedByTaskId. `blocks` is directional; the others are
 * symmetric in meaning but stored once (source→target). Pure input validation lives in isValidLink.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { TaskRelation, TaskRelationType } from "@agentcenter/database";

const RELATION_TYPES: TaskRelationType[] = ["blocks", "relates_to", "duplicates"];

export function isTaskRelationType(v: string): v is TaskRelationType {
  return (RELATION_TYPES as string[]).includes(v);
}

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** All relations touching a task, in either direction (source or target). */
export function taskRelations(taskId: string): Promise<TaskRelation[]> {
  return prisma.taskRelation.findMany({
    where: { OR: [{ sourceTaskId: taskId }, { targetTaskId: taskId }] },
    orderBy: { createdAt: "asc" },
  });
}

/** Create a typed link source→target. Rejects self-links, unknown tasks, and cycles for `blocks`. */
export async function linkTasks(args: {
  sourceTaskId: string;
  targetTaskId: string;
  type: TaskRelationType;
  createdByProfileId?: string | null;
}): Promise<TaskRelation> {
  if (args.sourceTaskId === args.targetTaskId) badRequest("a task cannot be linked to itself");
  const tasks = await prisma.task.findMany({
    where: { id: { in: [args.sourceTaskId, args.targetTaskId] } },
    select: { id: true },
  });
  if (tasks.length !== 2) badRequest("both tasks must exist");

  // For `blocks`, refuse a direct cycle (A blocks B while B blocks A) to keep the DAG acyclic.
  if (args.type === "blocks") {
    const reverse = await prisma.taskRelation.findFirst({
      where: { sourceTaskId: args.targetTaskId, targetTaskId: args.sourceTaskId, type: "blocks" },
      select: { id: true },
    });
    if (reverse) badRequest("that would create a blocking cycle");
  }

  const existing = await prisma.taskRelation.findFirst({
    where: { sourceTaskId: args.sourceTaskId, targetTaskId: args.targetTaskId, type: args.type },
    select: { id: true },
  });
  if (existing) badRequest("that relation already exists");

  return prisma.taskRelation.create({
    data: {
      sourceTaskId: args.sourceTaskId,
      targetTaskId: args.targetTaskId,
      type: args.type,
      createdByProfileId: args.createdByProfileId ?? null,
    },
  });
}

export async function unlinkTasks(relationId: string): Promise<boolean> {
  const res = await prisma.taskRelation.deleteMany({ where: { id: relationId } });
  return res.count > 0;
}
