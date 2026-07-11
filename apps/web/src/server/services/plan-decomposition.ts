/**
 * Plan decomposition (Epic #8). An agent proposes a subtask plan for a parent task; a human reviews
 * it; only on approval does apply create the child Tasks (under parentTaskId). Same plan shape as
 * TaskTemplate.subtasks: [{title, description, priority?, tags?}].
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { PlanDecomposition, Priority } from "@agentcenter/database";

export interface PlanItem {
  title: string;
  description: string;
  priority?: string;
  tags?: string[];
}

const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

/** Pure: validate + normalize a decomposition plan. Throws BAD_USER_INPUT on a malformed plan. */
export function validatePlan(plan: unknown): PlanItem[] {
  if (!Array.isArray(plan) || plan.length === 0)
    throw new GraphQLError("plan must be a non-empty array", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  return plan.map((raw, i) => {
    const item = raw as Record<string, unknown>;
    if (typeof item.title !== "string" || !item.title.trim())
      throw new GraphQLError(`plan[${i}].title is required`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    if (typeof item.description !== "string")
      throw new GraphQLError(`plan[${i}].description must be a string`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    if (item.priority != null && !PRIORITIES.has(String(item.priority)))
      throw new GraphQLError(`plan[${i}].priority is invalid`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    if (item.tags != null && !Array.isArray(item.tags))
      throw new GraphQLError(`plan[${i}].tags must be an array`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    return {
      title: item.title.trim(),
      description: item.description,
      priority: item.priority != null ? String(item.priority) : undefined,
      tags: Array.isArray(item.tags) ? item.tags.map(String) : undefined,
    };
  });
}

export async function proposeDecomposition(args: {
  parentTaskId: string;
  plan: unknown;
  generatedByAgentId?: string | null;
}): Promise<PlanDecomposition> {
  const items = validatePlan(args.plan);
  const parent = await prisma.task.findUnique({
    where: { id: args.parentTaskId },
    select: { id: true },
  });
  if (!parent)
    throw new GraphQLError("Parent task not found", { extensions: { code: "NOT_FOUND" } });
  return prisma.planDecomposition.create({
    data: {
      parentTaskId: args.parentTaskId,
      plan: items as never,
      generatedByAgentId: args.generatedByAgentId ?? null,
      status: "proposed",
    },
  });
}

export async function reviewDecomposition(args: {
  id: string;
  decision: "approve" | "reject";
  reviewedByProfileId: string;
}): Promise<PlanDecomposition> {
  const dec = await prisma.planDecomposition.findUnique({ where: { id: args.id } });
  if (!dec)
    throw new GraphQLError("Decomposition not found", { extensions: { code: "NOT_FOUND" } });
  if (dec.status !== "proposed")
    throw new GraphQLError(`Decomposition is already ${dec.status}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  return prisma.planDecomposition.update({
    where: { id: args.id },
    data: {
      status: args.decision === "approve" ? "approved" : "rejected",
      reviewedByProfileId: args.reviewedByProfileId,
    },
  });
}

/** Apply an APPROVED decomposition: create the child Tasks under the parent. Idempotent per row. */
export async function applyDecomposition(id: string): Promise<{ taskIds: string[] }> {
  const dec = await prisma.planDecomposition.findUnique({ where: { id } });
  if (!dec)
    throw new GraphQLError("Decomposition not found", { extensions: { code: "NOT_FOUND" } });
  if (dec.status !== "approved")
    throw new GraphQLError("Only an approved decomposition can be applied", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  const items = validatePlan(dec.plan);
  const parent = await prisma.task.findUnique({
    where: { id: dec.parentTaskId },
    select: { projectId: true },
  });

  const taskIds: string[] = [];
  for (const item of items) {
    const child = await prisma.task.create({
      data: {
        title: item.title,
        description: item.description,
        parentTaskId: dec.parentTaskId,
        ...(item.priority ? { priority: item.priority as Priority } : {}),
        ...(item.tags ? { tags: item.tags } : {}),
        ...(parent?.projectId ? { projectId: parent.projectId } : {}),
      },
    });
    taskIds.push(child.id);
  }
  await prisma.planDecomposition.update({
    where: { id },
    data: { status: "applied", appliedAt: new Date() },
  });
  return { taskIds };
}
