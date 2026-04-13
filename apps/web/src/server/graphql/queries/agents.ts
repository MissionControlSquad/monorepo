import { builder } from "../builder";
import {
  getLatestAgentActionIds,
  countActiveTaskAssigneesByProfile,
  countCompletedTaskAssigneesByProfile,
} from "@agentcenter/database";
import {
  agentModel,
  statusHistoryModel,
  deliverableModel,
  workSessionModel,
  agentQueueItemModel,
} from "../../models";
import { profileStatsCache, transitionIdsCache } from "../../cache";
import { getOrCreateAgentProfileId } from "../../agent-profile";
import { QueueItemStatus } from "../../constants";

builder.queryField("agents", (t) =>
  t.prismaField({
    type: ["Agent"],
    args: {
      limit: t.arg.int({ defaultValue: 100 }),
      offset: t.arg.int({ defaultValue: 0 }),
    },
    resolve: (query, _root, args) =>
      agentModel.findMany({
        ...query,
        orderBy: [{ level: "desc" }, { name: "asc" }],
        take: Math.min(args.limit ?? 100, 500),
        skip: args.offset ?? 0,
      }),
  }),
);

builder.queryField("agent", (t) =>
  t.prismaField({
    type: "Agent",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => agentModel.findById(args.id, query),
  }),
);

builder.queryField("agentStatusHistory", (t) =>
  t.prismaField({
    type: ["StatusHistory"],
    args: {
      agentId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 50 }),
    },
    resolve: (query, _root, args) =>
      statusHistoryModel.findMany({
        ...query,
        where: { agentId: args.agentId },
        orderBy: { timestamp: "desc" },
        take: args.limit ?? 50,
      }),
  }),
);

builder.queryField("agentLatestTransitions", (t) =>
  t.prismaField({
    type: ["StatusHistory"],
    description: "Returns the latest status transition for each agent (one per agent).",
    resolve: async (query) => {
      // Cache the expensive DISTINCT ON scan (5 min TTL)
      let latestIds = transitionIdsCache.get("all");
      if (!latestIds) {
        latestIds = await getLatestAgentActionIds();
        transitionIdsCache.set("all", latestIds!);
      }
      if (!latestIds || latestIds.length === 0) return [];
      return statusHistoryModel.findMany({
        ...query,
        where: { id: { in: latestIds.map((r) => r.id) } },
        orderBy: { timestamp: "desc" },
      });
    },
  }),
);

builder.queryField("agentProfileStats", (t) =>
  t.field({
    type: AgentProfileStatsType,
    nullable: true,
    args: {
      agentId: t.arg.string({ required: true }),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args) => {
      const { agentId, projectId } = args;
      const cacheKey = `${agentId}:${projectId ?? "all"}`;
      const cached = profileStatsCache.get(cacheKey);
      if (cached) return cached;

      const taskFilter = projectId ? { task: { projectId } } : {};
      const profileId = await getOrCreateAgentProfileId(agentId);

      const [
        tasksAssigned,
        tasksCompleted,
        deliverablesCount,
        workSessions,
        queueTotal,
        queueCompleted,
      ] = await Promise.all([
        countActiveTaskAssigneesByProfile(profileId, projectId ?? undefined),
        countCompletedTaskAssigneesByProfile(profileId, projectId ?? undefined),
        deliverableModel.count({
          where: { profileId, ...taskFilter },
        }),
        workSessionModel.findMany({
          where: {
            agentId,
            eventType: { in: ["started", "continued"] },
            ...taskFilter,
          },
          select: { duration: true },
        }),
        agentQueueItemModel.count({ where: { agentId } }),
        agentQueueItemModel.count({
          where: { agentId, status: QueueItemStatus.COMPLETED },
        }),
      ]);

      const totalWorkTimeMs = workSessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
      const queueCompletionRate = queueTotal > 0 ? queueCompleted / queueTotal : 0;

      const result = {
        tasksAssigned,
        tasksCompleted,
        deliverablesCount,
        totalWorkTimeMs,
        queueCompletionRate,
      };
      profileStatsCache.set(cacheKey, result);
      return result;
    },
  }),
);

// Helper type for profile stats
const AgentProfileStatsType = builder.simpleObject("AgentProfileStats", {
  fields: (t) => ({
    tasksAssigned: t.int(),
    tasksCompleted: t.int(),
    deliverablesCount: t.int(),
    totalWorkTimeMs: t.int(),
    queueCompletionRate: t.float(),
  }),
});
