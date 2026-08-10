/**
 * Parity §3.12 — first-class task labels. Reuses the generic workspace-scoped `Label` catalog
 * (shared with Cases) via a `TaskLabel` join, so a task carries structured labels beyond `tags[]`.
 * Workspace-scoped: a label and its task must live in the same workspace (D5).
 */
import { prisma } from "@/server/prisma";
import type { Label, TaskLabel } from "@agentcenter/database";
import { badRequest } from "./service-errors";

/** List a task's labels (with the underlying label), oldest-attached first. */
export function listTaskLabels(taskId: string): Promise<(TaskLabel & { label: Label })[]> {
  return prisma.taskLabel.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { label: true },
  });
}

/** Find an existing workspace label by name (case-insensitive) or create it. Idempotent. */
export async function createOrGetLabel(
  workspaceId: string,
  name: string,
  color?: string | null,
): Promise<Label> {
  const n = name.trim();
  if (!n) badRequest("label name is required");
  const existing = await prisma.label.findFirst({ where: { workspaceId, name: n } });
  if (existing) return existing;
  return prisma.label.create({ data: { workspaceId, name: n, color: color?.trim() || "#888888" } });
}

/** Attach a label (by name — created if new) to a task. Idempotent on the (task, label) pair. */
export async function addTaskLabel(args: {
  workspaceId: string;
  taskId: string;
  name: string;
  color?: string | null;
}): Promise<TaskLabel & { label: Label }> {
  const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { id: true } });
  if (!task) badRequest("task not found");
  const label = await createOrGetLabel(args.workspaceId, args.name, args.color);
  const existing = await prisma.taskLabel.findFirst({
    where: { taskId: args.taskId, labelId: label.id },
    include: { label: true },
  });
  if (existing) return existing;
  return prisma.taskLabel.create({
    data: { workspaceId: args.workspaceId, taskId: args.taskId, labelId: label.id },
    include: { label: true },
  });
}

/** Detach a label from a task. Returns true if a join row was removed. Workspace-scoped. */
export async function removeTaskLabel(args: {
  workspaceId: string;
  taskId: string;
  labelId: string;
}): Promise<boolean> {
  const res = await prisma.taskLabel.deleteMany({
    where: { taskId: args.taskId, labelId: args.labelId, workspaceId: args.workspaceId },
  });
  return res.count > 0;
}
