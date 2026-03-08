import { builder } from "../builder";
import { taskModel, agentModel, workSessionModel } from "../../models";
import { prisma, notDeleted } from "../../prisma";
import { workSummaryCache } from "../../cache";
import { Roles } from "../../constants";
import { getOrCreateAgentProfileId } from "../../agent-profile";
import { generateRecurringTasks } from "../../recurring-tasks";
import { buildTaskFilterWhere } from "./task-filters";

/** Only filter by project when a non-empty id is given; otherwise return tasks from all projects (and unscoped). "all" is treated as no filter. */
function projectFilter(projectId: string | null | undefined): { projectId?: string } {
  if (projectId == null || projectId === "" || projectId === "all") return {};
  return { projectId };
}

builder.queryField("tasks", (t) =>
  t.prismaField({
    type: ["Task"],
    args: {
      limit: t.arg.int({ defaultValue: 100 }),
      projectId: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      // Lazy-generate any overdue recurring task instances
      await generateRecurringTasks({ projectId: args.projectId ?? undefined });

      return taskModel.findMany({
        ...query,
        where: {
          ...projectFilter(args.projectId),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 100, 500),
      });
    },
  }),
);

builder.queryField("task", (t) =>
  t.prismaField({
    type: "Task",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => taskModel.findById(args.id, query),
  }),
);

builder.queryField("taskByNumber", (t) =>
  t.prismaField({
    type: "Task",
    nullable: true,
    args: { taskNumber: t.arg.int({ required: true }) },
    resolve: (query, _root, args) =>
      taskModel.findOne({
        ...query,
        where: { taskNumber: args.taskNumber },
      }),
  }),
);

builder.queryField("tasksByStatus", (t) =>
  t.prismaField({
    type: ["Task"],
    args: {
      status: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 200 }),
      offset: t.arg.int({ defaultValue: 0 }),
      projectId: t.arg.string(),
      // Kanban filter args
      priorities: t.arg.stringList(),
      assigneeIds: t.arg.stringList(),
      unassignedOnly: t.arg.boolean(),
      tags: t.arg.stringList(),
      dueDateFilter: t.arg.string(),
      blockedOnly: t.arg.boolean(),
      topLevelOnly: t.arg.boolean(),
      noProjectOnly: t.arg.boolean(),
      searchQuery: t.arg.string(),
    },
    resolve: (query, _root, args) =>
      taskModel.findMany({
        ...query,
        where: {
          status: args.status as any,
          ...projectFilter(args.projectId),
          ...buildTaskFilterWhere(args),
        },
        orderBy: { createdAt: "desc" },
        skip: args.offset ?? 0,
        take: Math.min(args.limit ?? 200, 50_000),
      }),
  }),
);

const TaskStatusCountType = builder.simpleObject("TaskStatusCount", {
  fields: (t) => ({
    status: t.string(),
    count: t.int(),
  }),
});

builder.queryField("taskCountsByStatus", (t) =>
  t.field({
    type: [TaskStatusCountType],
    args: {
      projectId: t.arg.string(),
      // Kanban filter args
      priorities: t.arg.stringList(),
      assigneeIds: t.arg.stringList(),
      unassignedOnly: t.arg.boolean(),
      tags: t.arg.stringList(),
      dueDateFilter: t.arg.string(),
      blockedOnly: t.arg.boolean(),
      topLevelOnly: t.arg.boolean(),
      noProjectOnly: t.arg.boolean(),
      searchQuery: t.arg.string(),
    },
    resolve: async (_root, args) => {
      const filterWhere = buildTaskFilterWhere(args);
      const results = await prisma.task.groupBy({
        by: ["status"],
        _count: { status: true },
        where: {
          ...notDeleted,
          ...projectFilter(args.projectId),
          ...filterWhere,
        },
      });
      return results.map((r) => ({
        status: r.status,
        count: r._count.status,
      }));
    },
  }),
);

builder.queryField("tasksByAssignee", (t) =>
  t.prismaField({
    type: ["Task"],
    args: {
      agentId: t.arg.string({ required: true }),
      includeDone: t.arg.boolean({ defaultValue: false }),
      limit: t.arg.int({ defaultValue: 200 }),
      projectId: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const profileId = await getOrCreateAgentProfileId(args.agentId);
      return taskModel.findMany({
        ...query,
        where: {
          assignees: { some: { profileId } },
          ...(args.includeDone ? {} : { status: { not: "done" } }),
          ...projectFilter(args.projectId),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 200, 500),
      });
    },
  }),
);

builder.queryField("tasksByStatusForAgent", (t) =>
  t.field({
    type: TasksByStatusType,
    args: {
      agentId: t.arg.string({ required: true }),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args) => {
      const agent = await agentModel.findById(args.agentId);
      if (!agent) return emptyTasksByStatus();

      const isLead = agent.role === Roles.SQUAD_LEAD;
      const profileId = !isLead ? await getOrCreateAgentProfileId(agent.id) : undefined;
      const baseWhere = {
        ...projectFilter(args.projectId),
        ...(profileId ? { assignees: { some: { profileId } } } : {}),
      };

      const statuses = ["inbox", "assigned", "in_progress", "review", "done", "blocked"] as const;

      const results = await Promise.all(
        statuses.map((status) =>
          taskModel.findMany({
            where: { ...baseWhere, status },
            orderBy: { createdAt: "desc" },
            include: { assignees: { include: { profile: true } } },
          }),
        ),
      );

      return {
        inbox: results[0],
        assigned: results[1],
        inProgress: results[2],
        review: results[3],
        done: results[4],
        blocked: results[5],
      };
    },
  }),
);

builder.queryField("childTasks", (t) =>
  t.prismaField({
    type: ["Task"],
    args: { parentTaskId: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      taskModel.findMany({
        ...query,
        where: { parentTaskId: args.parentTaskId },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
  }),
);

builder.queryField("taskWorkSessions", (t) =>
  t.prismaField({
    type: ["WorkSession"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      workSessionModel.findMany({
        ...query,
        where: { taskId: args.taskId },
        orderBy: { startedAt: "desc" },
        take: 200,
      }),
  }),
);

builder.queryField("taskWorkSummary", (t) =>
  t.field({
    type: WorkSummaryType,
    nullable: true,
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (_root, args) => {
      const cached = workSummaryCache.get(args.taskId);
      if (cached) return cached;

      const sessions = await workSessionModel.findMany({
        where: {
          taskId: args.taskId,
          eventType: { in: ["started", "continued"] },
        },
        include: { agent: true },
      });

      const totalMs = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);

      const byAgent = new Map<string, { agentId: string; agentName: string; totalMs: number }>();
      for (const s of sessions) {
        const existing = byAgent.get(s.agentId) ?? {
          agentId: s.agentId,
          agentName: s.agent.name,
          totalMs: 0,
        };
        existing.totalMs += s.duration ?? 0;
        byAgent.set(s.agentId, existing);
      }

      const activeSessions = await workSessionModel.count({
        where: { taskId: args.taskId, endedAt: null },
      });

      const result = {
        totalWorkTimeMs: totalMs,
        agentBreakdown: Array.from(byAgent.values()),
        activeSessionCount: activeSessions,
      };
      workSummaryCache.set(args.taskId, result);
      return result;
    },
  }),
);

builder.queryField("tasksByProject", (t) =>
  t.prismaField({
    type: ["Task"],
    args: {
      projectId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 100 }),
    },
    resolve: (query, _root, args) =>
      taskModel.findMany({
        ...query,
        where: { projectId: args.projectId },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 100, 500),
      }),
  }),
);

// Helper types
const TasksByStatusType = builder.simpleObject("TasksByStatus", {
  fields: (t) => ({
    inbox: t.field({ type: ["JSON"] }),
    assigned: t.field({ type: ["JSON"] }),
    inProgress: t.field({ type: ["JSON"] }),
    review: t.field({ type: ["JSON"] }),
    done: t.field({ type: ["JSON"] }),
    blocked: t.field({ type: ["JSON"] }),
  }),
});

const AgentWorkBreakdownType = builder.simpleObject("AgentWorkBreakdown", {
  fields: (t) => ({
    agentId: t.string(),
    agentName: t.string(),
    totalMs: t.int(),
  }),
});

const WorkSummaryType = builder.simpleObject("WorkSummary", {
  fields: (t) => ({
    totalWorkTimeMs: t.int(),
    agentBreakdown: t.field({ type: [AgentWorkBreakdownType] }),
    activeSessionCount: t.int(),
  }),
});

function emptyTasksByStatus() {
  return {
    inbox: [],
    assigned: [],
    inProgress: [],
    review: [],
    done: [],
    blocked: [],
  };
}
