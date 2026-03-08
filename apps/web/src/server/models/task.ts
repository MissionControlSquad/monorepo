import type { Task, Prisma, TaskAssignee } from "@prisma/client";
import { prisma, notDeleted } from "../prisma";
import { emit } from "../events";
import { EventTypes } from "../constants";
import { Model } from "./base";
import type { FieldChange } from "../events/types";

/**
 * Centralized task model — all reads exclude soft-deleted tasks.
 *
 * Extends `Model<Task>` with task-specific queries.
 * Use `taskModel.*` instead of `prisma.task.*` for user-facing queries.
 * Event handlers that need to see soft-deleted rows should use
 * `prisma.task.*` directly.
 */
class TaskModel extends Model<Task> {
  constructor() {
    super(() => prisma.task, { softDelete: true });
  }

  /** Find a single task by ID with select (excludes soft-deleted) */
  findByIdSelect<S extends Prisma.TaskSelect>(
    id: string,
    select: S,
  ): Promise<Prisma.TaskGetPayload<{ select: S }> | null> {
    return prisma.task.findFirst({
      where: { id, ...notDeleted },
      select,
    }) as Promise<Prisma.TaskGetPayload<{ select: S }> | null>;
  }

  /** Find a single task by taskNumber (excludes soft-deleted) */
  findByNumber(taskNumber: number, args?: { include?: Prisma.TaskInclude }): Promise<Task | null> {
    return prisma.task.findFirst({
      ...args,
      where: { taskNumber, ...notDeleted },
    });
  }

  /** Set assignees for a task (replace all) — runs in a single transaction.
   *  Accepts profileIds (not agentIds). */
  async setAssignees(taskId: string, profileIds: string[]): Promise<TaskAssignee[]> {
    return prisma.$transaction(async (tx) => {
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      if (profileIds.length === 0) return [];
      await tx.taskAssignee.createMany({
        data: profileIds.map((profileId) => ({ taskId, profileId })),
        skipDuplicates: true,
      });
      return tx.taskAssignee.findMany({ where: { taskId } });
    });
  }

  /** Soft-delete a task */
  softDelete(id: string) {
    return prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ── Emit helpers ─────────────────────────────────────────

  async emitCreated(
    task: Pick<Task, "id" | "taskNumber" | "title">,
    ctx: {
      createdBy?: string;
      creatorName?: string;
      profileId?: string;
      assigneeIds: string[];
      fromDashboard: boolean;
    },
  ) {
    await emit({
      type: EventTypes.TASK_CREATED,
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      ...ctx,
    });
  }

  async emitStatusChanged(
    task: Pick<Task, "id" | "taskNumber" | "title">,
    ctx: {
      fromStatus: string;
      toStatus: string;
      changedBy?: string;
      profileId?: string;
      changes?: FieldChange[];
    },
  ) {
    await emit({
      type: EventTypes.TASK_STATUS_CHANGED,
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      ...ctx,
    });
  }

  async emitAssigneesChanged(
    task: Pick<Task, "id" | "taskNumber" | "title">,
    ctx: {
      addedIds: string[];
      removedIds: string[];
      addedNames: string[];
      removedNames: string[];
      profileId?: string;
      changes?: FieldChange[];
    },
  ) {
    await emit({
      type: EventTypes.TASK_ASSIGNEES_CHANGED,
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      ...ctx,
    });
  }

  async emitFieldsUpdated(
    task: Pick<Task, "id" | "taskNumber" | "title">,
    ctx?: { profileId?: string; changes?: FieldChange[] },
  ) {
    await emit({
      type: EventTypes.TASK_FIELDS_UPDATED,
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      profileId: ctx?.profileId,
      changes: ctx?.changes,
    });
  }

  async emitDeleted(
    task: Pick<Task, "id" | "taskNumber" | "title">,
    ctx: { agentId: string; agentName: string; assigneeIds: string[]; profileId?: string },
  ) {
    await emit({
      type: EventTypes.TASK_DELETED,
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      ...ctx,
    });
  }

  async emitApproved(
    task: Pick<Task, "id" | "taskNumber" | "title">,
    ctx: {
      reviewerId: string;
      reviewerName: string;
      assigneeIds: string[];
      assigneeNames: string[];
      childTasks?: { taskId: string; taskNumber: number; title: string }[];
    },
  ) {
    await emit({
      type: EventTypes.TASK_APPROVED,
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      ...ctx,
    });
  }

  async emitRejected(
    task: Pick<Task, "id" | "taskNumber" | "title">,
    ctx: {
      reviewerId: string;
      reviewerName: string;
      assigneeIds: string[];
      assigneeNames: string[];
      rejectionReason: string;
      changesNeeded: string[];
    },
  ) {
    await emit({
      type: EventTypes.TASK_REJECTED,
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      ...ctx,
    });
  }

  async emitClarificationRequested(
    task: Pick<Task, "id" | "taskNumber" | "title">,
    ctx: {
      reviewerId: string;
      reviewerName: string;
      assigneeIds: string[];
      assigneeNames: string[];
      questions: string[];
    },
  ) {
    await emit({
      type: EventTypes.TASK_CLARIFICATION_REQUESTED,
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      ...ctx,
    });
  }
}

export const taskModel = new TaskModel();
