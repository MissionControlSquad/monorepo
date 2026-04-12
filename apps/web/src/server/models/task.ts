import type { Task, Prisma, TaskAssignee } from "@agentcenter/database";
import {
  findTaskByNumber,
  findTaskByIdSelect,
  setTaskAssignees,
  softDeleteTask,
  taskDelegate,
} from "@agentcenter/database";
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
    super(taskDelegate, { softDelete: true });
  }

  /** Find a single task by ID with select (excludes soft-deleted) */
  findByIdSelect<S extends Prisma.TaskSelect>(
    id: string,
    select: S,
  ): Promise<Prisma.TaskGetPayload<{ select: S }> | null> {
    return findTaskByIdSelect(id, select);
  }

  /** Find a single task by taskNumber (excludes soft-deleted) */
  findByNumber(taskNumber: number, args?: { include?: Prisma.TaskInclude }): Promise<Task | null> {
    return findTaskByNumber(taskNumber, args);
  }

  /** Set assignees for a task (replace all) — runs in a single transaction.
   *  Accepts profileIds (not agentIds). */
  setAssignees(taskId: string, profileIds: string[]): Promise<TaskAssignee[]> {
    return setTaskAssignees(taskId, profileIds);
  }

  /** Soft-delete a task */
  softDelete(id: string) {
    return softDeleteTask(id);
  }

  // ── Emit helpers ─────────────────────────────────────────

  async emitCreated(
    task: Pick<Task, "id" | "taskNumber" | "title" | "description" | "priority">,
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
      description: task.description,
      priority: task.priority,
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
    task: Pick<Task, "id" | "taskNumber" | "title" | "description" | "priority">,
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
      description: task.description,
      priority: task.priority,
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
