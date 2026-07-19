/**
 * Goals / OKRs (Epic #11). Hierarchical goal tree (company → team → task), each optionally owned by an
 * agent. Ports Paperclip `services/goals.ts` (`goalService`, `getDefaultCompanyGoal`). workspaceId-scoped.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { wouldCreateCycle, type HierarchyEdge } from "@agentcenter/utils";
import type { Goal, GoalLevel, GoalStatus } from "@agentcenter/database";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/**
 * Reject a re-parent that would create a cycle (throwing wrapper over the shared `wouldCreateCycle`).
 * `edges` is every goal's (id → parentId) in the workspace.
 */
export function assertNoCycle(edges: HierarchyEdge[], id: string, parentId: string | null): void {
  if (parentId === id) badRequest("A goal cannot be its own parent");
  if (wouldCreateCycle(edges, id, parentId)) {
    badRequest("A goal cannot be moved under its own descendant");
  }
}

export function listGoals(workspaceId: string): Promise<Goal[]> {
  return prisma.goal.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
}

export function getGoal(workspaceId: string, id: string): Promise<Goal | null> {
  return prisma.goal.findFirst({ where: { workspaceId, id } });
}

/** Faithful port of `getDefaultCompanyGoal`: active root company → any root company → any company. */
export async function resolveDefaultGoal(workspaceId: string): Promise<Goal | null> {
  const activeRoot = await prisma.goal.findFirst({
    where: { workspaceId, level: "company", status: "active", parentId: null },
    orderBy: { createdAt: "asc" },
  });
  if (activeRoot) return activeRoot;
  const anyRoot = await prisma.goal.findFirst({
    where: { workspaceId, level: "company", parentId: null },
    orderBy: { createdAt: "asc" },
  });
  if (anyRoot) return anyRoot;
  return prisma.goal.findFirst({
    where: { workspaceId, level: "company" },
    orderBy: { createdAt: "asc" },
  });
}

/** Validate an optional parent + owner both live in this workspace. */
async function assertRefsInWorkspace(
  workspaceId: string,
  parentId: string | null,
  ownerAgentId: string | null,
): Promise<void> {
  if (parentId) {
    const parent = await prisma.goal.findFirst({
      where: { workspaceId, id: parentId },
      select: { id: true },
    });
    if (!parent) badRequest("parentId does not reference a goal in this workspace");
  }
  if (ownerAgentId) {
    const owner = await prisma.agent.findFirst({
      where: { workspaceId, id: ownerAgentId },
      select: { id: true },
    });
    if (!owner) badRequest("ownerAgentId does not reference an agent in this workspace");
  }
}

export async function createGoal(input: {
  workspaceId: string;
  title: string;
  description?: string | null;
  level?: GoalLevel | null;
  status?: GoalStatus | null;
  parentId?: string | null;
  ownerAgentId?: string | null;
}): Promise<Goal> {
  if (!input.title.trim()) badRequest("title is required");
  await assertRefsInWorkspace(
    input.workspaceId,
    input.parentId ?? null,
    input.ownerAgentId ?? null,
  );
  return prisma.goal.create({
    data: {
      workspaceId: input.workspaceId,
      title: input.title.trim(),
      description: input.description ?? null,
      level: input.level ?? "task",
      status: input.status ?? "planned",
      parentId: input.parentId ?? null,
      ownerAgentId: input.ownerAgentId ?? null,
    },
  });
}

export async function updateGoal(
  workspaceId: string,
  id: string,
  patch: {
    title?: string | null;
    description?: string | null;
    level?: GoalLevel | null;
    status?: GoalStatus | null;
    parentId?: string | null;
    ownerAgentId?: string | null;
  },
): Promise<Goal> {
  const existing = await prisma.goal.findFirst({
    where: { workspaceId, id },
    select: { id: true },
  });
  if (!existing) badRequest("Goal not found");

  await assertRefsInWorkspace(workspaceId, patch.parentId ?? null, patch.ownerAgentId ?? null);
  if (patch.parentId !== undefined && patch.parentId !== null) {
    const edges = await prisma.goal.findMany({
      where: { workspaceId },
      select: { id: true, parentId: true },
    });
    assertNoCycle(edges, id, patch.parentId);
  }

  return prisma.goal.update({
    where: { id },
    data: {
      ...(patch.title != null ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.level != null ? { level: patch.level } : {}),
      ...(patch.status != null ? { status: patch.status } : {}),
      ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
      ...(patch.ownerAgentId !== undefined ? { ownerAgentId: patch.ownerAgentId } : {}),
    },
  });
}

export async function deleteGoal(workspaceId: string, id: string): Promise<Goal> {
  const existing = await prisma.goal.findFirst({
    where: { workspaceId, id },
    select: { id: true },
  });
  if (!existing) badRequest("Goal not found");
  // Children re-root (schema onDelete: SetNull) — matches Paperclip's non-cascading delete.
  return prisma.goal.delete({ where: { id } });
}
