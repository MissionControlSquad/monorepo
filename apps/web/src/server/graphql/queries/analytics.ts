import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  getAgentTasksAssignedRaw,
  getAgentTasksCompletedRaw,
  getAgentDeliverablesRaw,
  getAgentWorkTimeRaw,
  getAgentQueueStatsRaw,
  getAgentWorkloadRaw,
  getAgentActivityHeatmapRaw,
  getActivityTrendRaw,
  notDeleted,
} from "@agentcenter/database";
import { agentModel, activityModel } from "../../models";
import { taskModel } from "../../models/task";
import {
  statusCountsCache,
  productivityCache,
  workloadCache,
  cycleTimesCache,
  activityTrendCache,
  heatmapCache,
} from "../../cache";

// --- Task Status Counts ---
const TaskStatusCountsType = builder.simpleObject("TaskStatusCounts", {
  fields: (t) => ({
    inbox: t.int(),
    assigned: t.int(),
    inProgress: t.int(),
    review: t.int(),
    done: t.int(),
    blocked: t.int(),
    total: t.int(),
  }),
});

builder.queryField("taskStatusCounts", (t) =>
  t.field({
    type: TaskStatusCountsType,
    args: { projectId: t.arg.string() },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.ANALYTICS);
      const cacheKey = args.projectId ?? "all";
      const cached = statusCountsCache.get(cacheKey);
      if (cached) return cached;

      const where = { ...notDeleted, ...(args.projectId ? { projectId: args.projectId } : {}) };
      // groupBy stays as direct delegate — no model wrapper needed
      const counts = await taskModel.delegate.groupBy({
        by: ["status"],
        where,
        _count: true,
      });

      const map: Record<string, number> = {};
      let total = 0;
      for (const c of counts) {
        map[c.status] = c._count;
        total += c._count;
      }

      const inbox = map["inbox"] ?? 0;
      const assigned = map["assigned"] ?? 0;
      const inProgress = map["in_progress"] ?? 0;
      const review = map["review"] ?? 0;
      const done = map["done"] ?? 0;
      const blocked = map["blocked"] ?? 0;

      const result = {
        inbox,
        assigned,
        inProgress,
        review,
        done,
        blocked,
        total,
      };
      statusCountsCache.set(cacheKey, result);
      return result;
    },
  }),
);

// --- Task Cycle Times ---
const CycleTimeStatsType = builder.simpleObject("CycleTimeStats", {
  fields: (t) => ({
    avgCycleTimeMs: t.float(),
    medianCycleTimeMs: t.float(),
    completedCount: t.int(),
  }),
});

builder.queryField("taskCycleTimes", (t) =>
  t.field({
    type: CycleTimeStatsType,
    args: { projectId: t.arg.string() },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.ANALYTICS);
      const cacheKey = `cycle:${args.projectId ?? "all"}`;
      const cached = cycleTimesCache.get(cacheKey);
      if (cached) return cached;

      // Use activity log "task_completed" for accurate completion timestamps
      // (task.updatedAt gets bumped by any edit, inflating cycle times)
      const projectFilter = args.projectId ? { projectId: args.projectId } : {};

      const completionActivities = await activityModel.findMany({
        where: {
          type: "task_completed",
          ...projectFilter,
        },
        select: { taskId: true, createdAt: true },
      });

      // Dedupe by taskId (keep earliest completion)
      const completionByTask = new Map<string, Date>();
      for (const a of completionActivities) {
        const tid = (a as any).taskId as string | null;
        if (!tid) continue;
        const existing = completionByTask.get(tid);
        if (!existing || a.createdAt < existing) {
          completionByTask.set(tid, a.createdAt);
        }
      }

      if (completionByTask.size === 0) {
        const empty = { avgCycleTimeMs: 0, medianCycleTimeMs: 0, completedCount: 0 };
        cycleTimesCache.set(cacheKey, empty);
        return empty;
      }

      // Fetch creation dates for the completed tasks
      const taskIds = Array.from(completionByTask.keys());
      const tasks = await taskModel.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, createdAt: true },
      });

      const cycleTimes = tasks
        .map((t) => {
          const completedAt = completionByTask.get(t.id);
          if (!completedAt) return -1;
          return completedAt.getTime() - t.createdAt.getTime();
        })
        .filter((v) => v > 0)
        .sort((a, b) => a - b);

      if (cycleTimes.length === 0) {
        const empty = { avgCycleTimeMs: 0, medianCycleTimeMs: 0, completedCount: 0 };
        cycleTimesCache.set(cacheKey, empty);
        return empty;
      }

      const avg = cycleTimes.reduce((s, v) => s + v, 0) / cycleTimes.length;
      const mid = Math.floor(cycleTimes.length / 2);
      const median =
        cycleTimes.length % 2 ? cycleTimes[mid] : (cycleTimes[mid - 1] + cycleTimes[mid]) / 2;

      const result = {
        avgCycleTimeMs: avg,
        medianCycleTimeMs: median,
        completedCount: cycleTimes.length,
      };
      cycleTimesCache.set(cacheKey, result);
      return result;
    },
  }),
);

// --- Task Completion Trend ---
const DayCountType = builder.simpleObject("DayCount", {
  fields: (t) => ({
    date: t.string(),
    count: t.int(),
  }),
});

builder.queryField("taskCompletionTrend", (t) =>
  t.field({
    type: [DayCountType],
    args: {
      days: t.arg.int({ defaultValue: 30 }),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.ANALYTICS);
      const daysBack = args.days ?? 30;
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      // Use activity log for accurate completion dates instead of task.updatedAt
      // (updatedAt gets bumped by any edit, not just status changes)
      const completionActivities = await activityModel.findMany({
        where: {
          type: "task_completed",
          createdAt: { gte: since },
          ...(args.projectId ? { projectId: args.projectId } : {}),
        },
        select: { createdAt: true, taskId: true },
      });

      // Dedupe by taskId (keep earliest completion) so re-approved tasks aren't counted twice
      const seenTasks = new Set<string>();
      const dedupedActivities = completionActivities.filter((a) => {
        const tid = (a as any).taskId as string | null;
        if (!tid || seenTasks.has(tid)) return false;
        seenTasks.add(tid);
        return true;
      });

      const buckets = new Map<string, number>();
      for (let i = 0; i < daysBack; i++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }

      for (const a of dedupedActivities) {
        const key = a.createdAt.toISOString().slice(0, 10);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }

      return Array.from(buckets.entries())
        .map(([date, count]) => ({ date, count }))
        .reverse();
    },
  }),
);

// --- Agent Productivity ---
const AgentProductivityType = builder.simpleObject("AgentProductivity", {
  fields: (t) => ({
    agentId: t.string(),
    agentName: t.string(),
    tasksAssigned: t.int(),
    tasksCompleted: t.int(),
    deliverablesCount: t.int(),
    totalWorkTimeMs: t.int(),
    queueCompletionRate: t.float(),
  }),
});

builder.queryField("agentProductivity", (t) =>
  t.field({
    type: [AgentProductivityType],
    args: { projectId: t.arg.string() },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.ANALYTICS);
      const cacheKey = `prod:${args.projectId ?? "all"}`;
      const cached = productivityCache.get(cacheKey);
      if (cached) return cached;

      const projectId = args.projectId;

      // 6 batch queries in parallel instead of 6×N sequential queries
      const [agents, assignedRows, completedRows, deliverableRows, workTimeRows, queueRows] =
        await Promise.all([
          agentModel.findMany({ select: { id: true, name: true } }),
          getAgentTasksAssignedRaw(projectId),
          getAgentTasksCompletedRaw(projectId),
          getAgentDeliverablesRaw(projectId),
          getAgentWorkTimeRaw(projectId),
          getAgentQueueStatsRaw(),
        ]);

      // Build lookup maps
      const assignedMap = new Map(assignedRows.map((r) => [r.agentId, r.count]));
      const completedMap = new Map(completedRows.map((r) => [r.agentId, r.count]));
      const deliverableMap = new Map(deliverableRows.map((r) => [r.agentId, r.count]));
      const workTimeMap = new Map(workTimeRows.map((r) => [r.agentId, r.total_ms]));
      const queueMap = new Map(queueRows.map((r) => [r.agentId, { total: r.total, done: r.done }]));

      const result = agents.map((agent) => {
        const qTotal = queueMap.get(agent.id)?.total ?? 0;
        const qDone = queueMap.get(agent.id)?.done ?? 0;
        return {
          agentId: agent.id,
          agentName: agent.name,
          tasksAssigned: assignedMap.get(agent.id) ?? 0,
          tasksCompleted: completedMap.get(agent.id) ?? 0,
          deliverablesCount: deliverableMap.get(agent.id) ?? 0,
          totalWorkTimeMs: workTimeMap.get(agent.id) ?? 0,
          queueCompletionRate: qTotal > 0 ? qDone / qTotal : 0,
        };
      });
      productivityCache.set(cacheKey, result);
      return result;
    },
  }),
);

// --- Agent Workload Distribution ---
const AgentWorkloadType = builder.simpleObject("AgentWorkload", {
  fields: (t) => ({
    agentId: t.string(),
    agentName: t.string(),
    inbox: t.int(),
    assigned: t.int(),
    inProgress: t.int(),
    review: t.int(),
    done: t.int(),
    blocked: t.int(),
  }),
});

builder.queryField("agentWorkloadDistribution", (t) =>
  t.field({
    type: [AgentWorkloadType],
    args: { projectId: t.arg.string() },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.ANALYTICS);
      const cacheKey = `workload:${args.projectId ?? "all"}`;
      const cached = workloadCache.get(cacheKey);
      if (cached) return cached;

      const projectId = args.projectId;

      // 2 queries instead of N+1
      const [agents, statusRows] = await Promise.all([
        agentModel.findMany({ select: { id: true, name: true } }),
        getAgentWorkloadRaw(projectId),
      ]);

      // Build nested map: agentId -> status -> count
      const statusMap = new Map<string, Record<string, number>>();
      for (const row of statusRows) {
        let counts = statusMap.get(row.agentId);
        if (!counts) {
          counts = {};
          statusMap.set(row.agentId, counts);
        }
        counts[row.status] = row.count;
      }

      const result = agents.map((agent) => {
        const counts = statusMap.get(agent.id) ?? {};
        return {
          agentId: agent.id,
          agentName: agent.name,
          inbox: counts["inbox"] ?? 0,
          assigned: counts["assigned"] ?? 0,
          inProgress: counts["in_progress"] ?? 0,
          review: counts["review"] ?? 0,
          done: counts["done"] ?? 0,
          blocked: counts["blocked"] ?? 0,
        };
      });
      workloadCache.set(cacheKey, result);
      return result;
    },
  }),
);

// --- Review Metrics ---
const ReviewMetricsType = builder.simpleObject("ReviewMetrics", {
  fields: (t) => ({
    approved: t.int(),
    rejected: t.int(),
    clarification: t.int(),
  }),
});

builder.queryField("reviewMetrics", (t) =>
  t.field({
    type: ReviewMetricsType,
    args: { projectId: t.arg.string() },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.ANALYTICS);
      // Review activities are logged with type "task_completed" (approved) or
      // "task_updated" (rejected / clarification), distinguished by metadata.eventType.
      const where = {
        type: { in: ["task_completed" as const, "task_updated" as const] },
        ...(args.projectId ? { projectId: args.projectId } : {}),
      };

      const activities = await activityModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: { metadata: true, type: true },
      });

      let approved = 0;
      let rejected = 0;
      let clarification = 0;

      for (const a of activities) {
        const meta = a.metadata as Record<string, unknown> | null;
        const eventType = meta?.eventType ?? a.type;
        if (eventType === "task.approved") approved++;
        else if (eventType === "task.rejected") rejected++;
        else if (eventType === "task.clarification_requested") clarification++;
      }

      return { approved, rejected, clarification };
    },
  }),
);

// --- Agent Activity Heatmap ---
const HeatmapCellType = builder.simpleObject("HeatmapCell", {
  fields: (t) => ({
    dayOfWeek: t.int(), // 0=Mon .. 6=Sun
    hour: t.int(), // 0-23
    count: t.int(),
  }),
});

builder.queryField("agentActivityHeatmap", (t) =>
  t.field({
    type: [HeatmapCellType],
    args: {
      days: t.arg.int({ defaultValue: 28 }),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.ANALYTICS);
      const daysBack = args.days ?? 28;
      const cacheKey = `heatmap:${daysBack}:${args.projectId ?? "all"}`;
      const cached = heatmapCache.get(cacheKey);
      if (cached) return cached;

      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const rows = await getAgentActivityHeatmapRaw(since, args.projectId);

      // Postgres DOW: 0=Sun, 1=Mon ... 6=Sat → remap to 0=Mon ... 6=Sun
      const result = rows.map((r) => ({
        dayOfWeek: r.dow === 0 ? 6 : r.dow - 1,
        hour: r.hour,
        count: r.count,
      }));

      heatmapCache.set(cacheKey, result);
      return result;
    },
  }),
);

// --- Activity Trend ---
builder.queryField("activityTrend", (t) =>
  t.field({
    type: [DayCountType],
    args: {
      days: t.arg.int({ defaultValue: 30 }),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.ANALYTICS);
      const daysBack = args.days ?? 30;
      const cacheKey = `trend:${daysBack}:${args.projectId ?? "all"}`;
      const cached = activityTrendCache.get(cacheKey);
      if (cached) return cached;

      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      // Use database-level aggregation to avoid the previous 5,000 record cap
      // that silently undercounted older days when activity was high.
      const dayCounts = await getActivityTrendRaw(since, args.projectId);

      const dayCountMap = new Map<string, number>();
      for (const row of dayCounts) {
        // row.day is a Date from Postgres — normalize to UTC YYYY-MM-DD
        const key =
          row.day instanceof Date
            ? row.day.toISOString().slice(0, 10)
            : String(row.day).slice(0, 10);
        dayCountMap.set(key, row.count);
      }

      // Build date buckets in UTC
      const buckets = new Map<string, number>();
      for (let i = 0; i < daysBack; i++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, dayCountMap.get(key) ?? 0);
      }

      const result = Array.from(buckets.entries())
        .map(([date, count]) => ({ date, count }))
        .reverse();
      activityTrendCache.set(cacheKey, result);
      return result;
    },
  }),
);
