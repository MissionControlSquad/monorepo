import { builder } from "../builder";
import { requireRole } from "@/server/tenancy/guards";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { runTaskUpdateTransaction } from "@agentcenter/database";
import { taskModel, agentModel } from "../../models";
import { pubsub, PubSubEvent, taskTopic, taskProjectTopic } from "../../pubsub";
import { TaskStatus, WorkMode } from "../../constants";
import type { WorkModeValue } from "../../constants";
import { assertAssignableAgents } from "../../assignment-guard";
import { assertProjectWritable } from "../../system-settings";
import { getOrCreateAgentProfileId } from "../../agent-profile";
import { resolveTaskGoalId, resolveTaskGoalIdOnUpdate } from "../../services/goals";
import type { FieldChange } from "../../events/types";

/** Publish task update to per-task, per-project, and global topics. */
function publishTaskUpdated(taskId: string, projectId?: string) {
  const payload = { taskId, projectId };
  pubsub.publish(taskTopic(taskId), payload);
  if (projectId) pubsub.publish(taskProjectTopic(projectId), payload);
  pubsub.publish(PubSubEvent.TASK.UPDATED, payload);
}

/** Parity §3.12 — validate a client-supplied WorkMode; returns undefined for null/unknown (falls back to the DB default). */
export function parseWorkMode(value: string | null | undefined): WorkModeValue | undefined {
  if (value == null) return undefined;
  return (Object.values(WorkMode) as string[]).includes(value)
    ? (value as WorkModeValue)
    : undefined;
}

/** Parse dueDate from client: ISO string or numeric string (ms since epoch). Avoids Invalid Date when client sends timestamp. */
export function parseDueDate(value: string | null | undefined): Date | undefined {
  if (value == null || value === "") return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber)) return new Date(asNumber);
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

builder.mutationField("createTask", (t) =>
  t.prismaField({
    type: "Task",
    args: {
      title: t.arg.string({ required: true }),
      description: t.arg.string({ required: true }),
      assigneeIds: t.arg.stringList({ required: true }),
      createdById: t.arg.string(),
      priority: t.arg.string(),
      workMode: t.arg.string(),
      dueDate: t.arg.string(),
      tags: t.arg.stringList(),
      parentTaskId: t.arg.string(),
      projectId: t.arg.string(),
      goalId: t.arg.string(),
      blockedByTaskId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      // Human write gate (docs/RBAC.md §D): viewer is read-only; member+ (and API-key agents,
      // which resolve as `member`) may operate. Run-bridge agents bypass this resolver entirely.
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      if (args.projectId) await assertProjectWritable(args.projectId);
      await assertAssignableAgents(args.assigneeIds, args.projectId);

      // Resolve agentIds → profileIds
      const assigneeProfileIds = await Promise.all(
        args.assigneeIds.map((id) => getOrCreateAgentProfileId(id)),
      );
      const createdByProfileId = args.createdById
        ? await getOrCreateAgentProfileId(args.createdById)
        : undefined;

      // Epic #11b: auto-resolve the task's goal (explicit → project default → workspace default).
      const goalId = await resolveTaskGoalId({
        projectId: args.projectId,
        goalId: args.goalId,
        fallbackWorkspaceId: ctx.tenancy?.workspaceId,
      });

      const task = await taskModel.create({
        ...query,
        data: {
          title: args.title,
          description: args.description,
          status: TaskStatus.INBOX,
          workMode: parseWorkMode(args.workMode),
          priority: (args.priority as any) ?? undefined,
          createdByProfileId,
          dueDate: parseDueDate(args.dueDate),
          tags: args.tags ?? [],
          parentTaskId: args.parentTaskId ?? undefined,
          projectId: args.projectId ?? undefined,
          goalId: goalId ?? undefined,
          blockedByTaskId: args.blockedByTaskId ?? undefined,
          assignees: {
            create: assigneeProfileIds.map((profileId) => ({ profileId })),
          },
        },
      });

      const creator = args.createdById ? await agentModel.findById(args.createdById) : null;

      await taskModel.emitCreated(task, {
        createdBy: args.createdById ?? undefined,
        creatorName: creator?.name,
        profileId: createdByProfileId,
        assigneeIds: args.assigneeIds,
        fromDashboard: false,
      });

      publishTaskUpdated(task.id, task.projectId ?? undefined);
      return task;
    },
  }),
);

builder.mutationField("createTaskFromDashboard", (t) =>
  t.prismaField({
    type: "Task",
    args: {
      title: t.arg.string({ required: true }),
      description: t.arg.string({ required: true }),
      priority: t.arg.string(),
      workMode: t.arg.string(),
      assigneeIds: t.arg.stringList(),
      dueDate: t.arg.string(),
      tags: t.arg.stringList(),
      parentTaskId: t.arg.string(),
      projectId: t.arg.string(),
      blockedByTaskId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      if (args.projectId) await assertProjectWritable(args.projectId);
      const assigneeIds = args.assigneeIds ?? [];
      await assertAssignableAgents(assigneeIds, args.projectId);

      // Resolve agentIds → profileIds
      const assigneeProfileIds = await Promise.all(
        assigneeIds.map((id) => getOrCreateAgentProfileId(id)),
      );

      const createdByProfileId = ctx.session?.profileId ?? undefined;

      const task = await taskModel.create({
        ...query,
        data: {
          title: args.title,
          description: args.description,
          status: TaskStatus.INBOX,
          workMode: parseWorkMode(args.workMode),
          priority: (args.priority as any) ?? undefined,
          createdByProfileId,
          dueDate: parseDueDate(args.dueDate),
          tags: args.tags ?? [],
          parentTaskId: args.parentTaskId ?? undefined,
          projectId: args.projectId ?? undefined,
          blockedByTaskId: args.blockedByTaskId ?? undefined,
          assignees: {
            create: assigneeProfileIds.map((profileId) => ({ profileId })),
          },
        },
      });

      await taskModel.emitCreated(task, {
        createdBy: undefined,
        creatorName: undefined,
        profileId: createdByProfileId,
        assigneeIds,
        fromDashboard: true,
      });

      publishTaskUpdated(task.id, task.projectId ?? undefined);
      return task;
    },
  }),
);

builder.mutationField("updateTask", (t) =>
  t.prismaField({
    type: "Task",
    args: {
      id: t.arg.string({ required: true }),
      title: t.arg.string(),
      description: t.arg.string(),
      status: t.arg.string(),
      workMode: t.arg.string(),
      assigneeIds: t.arg.stringList(),
      priority: t.arg.string(),
      dueDate: t.arg.string(),
      tags: t.arg.stringList(),
      parentTaskId: t.arg.string(),
      blockedByTaskId: t.arg.string(),
      agentId: t.arg.string(),
      projectId: t.arg.string(),
      goalId: t.arg.string(),
      clearGoal: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const oldTask = await taskModel.findById(args.id, {
        include: { assignees: { include: { profile: true } } },
      });
      if (!oldTask) throw new Error("Task not found");

      const sessionProfileId = ctx.session?.profileId ?? undefined;
      const changedBy = args.agentId ? await agentModel.findById(args.agentId) : null;

      // Build update data (only include changed fields)
      const data: Record<string, unknown> = {};
      if (args.title !== undefined && args.title !== null) data.title = args.title;
      if (args.description !== undefined && args.description !== null)
        data.description = args.description;
      if (args.status !== undefined && args.status !== null) data.status = args.status;
      if (args.workMode !== undefined && args.workMode !== null) {
        const wm = parseWorkMode(args.workMode);
        if (wm) data.workMode = wm;
      }
      if (args.priority !== undefined && args.priority !== null) data.priority = args.priority;
      if (args.dueDate !== undefined) data.dueDate = parseDueDate(args.dueDate) ?? null;
      if (args.tags !== undefined && args.tags !== null) data.tags = args.tags;
      if (args.parentTaskId !== undefined) data.parentTaskId = args.parentTaskId ?? null;
      if (args.blockedByTaskId !== undefined) data.blockedByTaskId = args.blockedByTaskId ?? null;
      // Only allow setting projectId if the task doesn't already have one
      const settingProject =
        args.projectId !== undefined && args.projectId !== null && !oldTask.projectId;
      if (settingProject) {
        await assertProjectWritable(args.projectId as string);
        data.projectId = args.projectId;
      }

      // Epic #11c: re-resolve the task's goal when its project or goal changes.
      const changingGoal = args.goalId !== undefined || args.clearGoal === true;
      if (settingProject || changingGoal) {
        data.goalId = await resolveTaskGoalIdOnUpdate({
          currentProjectId: oldTask.projectId ?? null,
          currentGoalId: oldTask.goalId ?? null,
          changingProject: settingProject,
          patchProjectId: settingProject ? (args.projectId as string) : undefined,
          changingGoal,
          patchGoalId: args.clearGoal ? null : args.goalId,
          fallbackWorkspaceId: ctx.tenancy?.workspaceId,
        });
      }

      // Compute assignee diff before the transaction
      // args.assigneeIds are agentIds from the API — resolve to profileIds
      let addedAgentIds: string[] = [];
      let removedAgentIds: string[] = [];
      let addedProfileIds: string[] = [];
      let removedProfileIds: string[] = [];
      if (args.assigneeIds) {
        await assertAssignableAgents(args.assigneeIds, oldTask.projectId);
        // Resolve incoming agentIds to profileIds
        const newProfileIds = await Promise.all(
          args.assigneeIds.map((id) => getOrCreateAgentProfileId(id)),
        );
        const oldProfileIds = new Set(oldTask.assignees.map((a: any) => a.profileId));
        const newProfileIdSet = new Set(newProfileIds);

        addedProfileIds = newProfileIds.filter((id) => !oldProfileIds.has(id));
        removedProfileIds = oldTask.assignees
          .map((a: any) => a.profileId as string)
          .filter((id: string) => !newProfileIdSet.has(id));

        // Keep agentIds for event emission (notification compat)
        // Build a profileId→agentId map from old assignees
        const oldProfileToAgent = new Map<string, string>();
        for (const a of oldTask.assignees) {
          if ((a as any).profile?.agentId) {
            oldProfileToAgent.set((a as any).profileId, (a as any).profile.agentId);
          }
        }
        // For added: we have the agentId→profileId mapping from resolution
        const agentToProfile = new Map<string, string>();
        for (let i = 0; i < args.assigneeIds.length; i++) {
          agentToProfile.set(args.assigneeIds[i], newProfileIds[i]);
        }
        addedAgentIds = args.assigneeIds.filter((agentId) => {
          const profileId = agentToProfile.get(agentId)!;
          return !oldProfileIds.has(profileId);
        });
        removedAgentIds = [];
        for (const a of oldTask.assignees) {
          const profileId = (a as any).profileId as string;
          if (!newProfileIdSet.has(profileId)) {
            const agentId = (a as any).profile?.agentId;
            if (agentId) removedAgentIds.push(agentId);
          }
        }
      }

      // Wrap task update + assignee changes in a single transaction
      const task = await runTaskUpdateTransaction(
        args.id,
        data,
        args.assigneeIds ? { addedProfileIds, removedProfileIds } : null,
        query,
      );

      // Emit assignee events outside the transaction (side effects)
      if (args.assigneeIds && (addedAgentIds.length > 0 || removedAgentIds.length > 0)) {
        const [addedAgents, removedAgents] = await Promise.all([
          agentModel.findMany({
            where: { id: { in: addedAgentIds } },
            select: { name: true },
          }),
          agentModel.findMany({
            where: { id: { in: removedAgentIds } },
            select: { name: true },
          }),
        ]);

        const addedNames = addedAgents.map((a) => a.name);
        const removedNames = removedAgents.map((a) => a.name);

        await taskModel.emitAssigneesChanged(task, {
          addedIds: addedAgentIds,
          removedIds: removedAgentIds,
          addedNames,
          removedNames,
          profileId: sessionProfileId,
          changes: [{ field: "assignees", from: removedNames, to: addedNames }],
        });
      }

      // Emit status change event
      if (args.status && args.status !== oldTask.status) {
        await taskModel.emitStatusChanged(task, {
          fromStatus: oldTask.status,
          toStatus: args.status,
          changedBy: changedBy?.id,
          profileId: sessionProfileId,
          changes: [{ field: "status", from: oldTask.status, to: args.status }],
        });
      }

      // Compute field-level changes for non-status, non-assignee fields
      const trackedFields = [
        "title",
        "description",
        "priority",
        "dueDate",
        "tags",
        "parentTaskId",
        "blockedByTaskId",
      ] as const;
      const fieldChanges: FieldChange[] = [];
      for (const field of trackedFields) {
        if (!(field in data)) continue;
        const oldVal = (oldTask as any)[field] ?? null;
        const newVal = data[field] ?? null;
        // Deep compare for arrays/dates
        const oldStr = oldVal instanceof Date ? oldVal.toISOString() : JSON.stringify(oldVal);
        const newStr =
          newVal instanceof Date ? (newVal as Date).toISOString() : JSON.stringify(newVal);
        if (oldStr !== newStr) {
          fieldChanges.push({
            field,
            from: oldVal instanceof Date ? oldVal.toISOString() : oldVal,
            to: newVal instanceof Date ? (newVal as Date).toISOString() : newVal,
          });
        }
      }

      // Always emit TASK_FIELDS_UPDATED when there are field changes (fix silent swallow bug)
      if (fieldChanges.length > 0) {
        await taskModel.emitFieldsUpdated(task, {
          profileId: sessionProfileId,
          changes: fieldChanges,
        });
      }

      publishTaskUpdated(task.id, task.projectId ?? undefined);
      return task;
    },
  }),
);

builder.mutationField("deleteTask", (t) =>
  t.field({
    type: "Boolean",
    args: {
      id: t.arg.string({ required: true }),
      agentId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const task = await taskModel.findById(args.id, {
        include: { assignees: { include: { profile: true } } },
      });
      if (!task) throw new Error("Task not found");

      const agent = await agentModel.findById(args.agentId);
      if (!agent) throw new Error("Agent not found");

      // Resolve profileId → agentId for notification compat
      const assigneeAgentIds = task.assignees
        .map((a: any) => a.profile?.agentId)
        .filter(Boolean) as string[];

      await taskModel.emitDeleted(task, {
        agentId: agent.id,
        agentName: agent.name,
        assigneeIds: assigneeAgentIds,
      });

      await taskModel.softDelete(args.id);

      publishTaskUpdated(task.id, task.projectId ?? undefined);
      return true;
    },
  }),
);
