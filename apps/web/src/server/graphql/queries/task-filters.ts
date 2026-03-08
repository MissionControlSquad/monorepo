import type { Prisma } from "@prisma/client";

interface TaskFilterArgs {
  priorities?: string[] | null;
  assigneeIds?: string[] | null;
  unassignedOnly?: boolean | null;
  tags?: string[] | null;
  dueDateFilter?: string | null;
  blockedOnly?: boolean | null;
  topLevelOnly?: boolean | null;
  noProjectOnly?: boolean | null;
  searchQuery?: string | null;
}

/**
 * Builds a Prisma `where` clause from Kanban filter args.
 * Returns only the conditions that are active — empty/null args produce no extra clauses.
 */
export function buildTaskFilterWhere(args: TaskFilterArgs): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};

  if (args.priorities && args.priorities.length > 0) {
    where.priority = { in: args.priorities as any };
  }

  if (args.unassignedOnly) {
    where.assignees = { none: {} };
  } else if (args.assigneeIds && args.assigneeIds.length > 0) {
    where.assignees = {
      some: { profile: { agentId: { in: args.assigneeIds } } },
    };
  }

  if (args.tags && args.tags.length > 0) {
    where.tags = { hasSome: args.tags };
  }

  if (args.dueDateFilter) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000 - 1);

    switch (args.dueDateFilter) {
      case "overdue":
        where.dueDate = { lt: startOfToday };
        break;
      case "today":
        where.dueDate = { gte: startOfToday, lte: endOfToday };
        break;
      case "this_week": {
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
        const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86400000 - 1);
        where.dueDate = { gte: startOfWeek, lte: endOfWeek };
        break;
      }
      case "no_due_date":
        where.dueDate = null;
        break;
    }
  }

  if (args.blockedOnly) {
    where.blockedByTaskId = { not: null };
  }

  if (args.topLevelOnly) {
    where.parentTaskId = null;
  }

  if (args.noProjectOnly) {
    where.projectId = null;
  }

  if (args.searchQuery) {
    where.title = { contains: args.searchQuery, mode: "insensitive" };
  }

  return where;
}
