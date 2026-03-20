import { builder } from "../builder";
import { activityModel, agentModel } from "../../models";
import { prisma } from "@agentcenter/database";
import { Roles } from "../../constants";
import { getOrCreateAgentProfileId } from "../../agent-profile";
import { ActivityConnectionRef } from "@agentcenter/graphql-server";

const ACTIVITY_PAGE_SIZE = 30;

builder.queryField("activitiesConnection", (t) =>
  t.field({
    type: ActivityConnectionRef,
    args: {
      first: t.arg.int({ defaultValue: ACTIVITY_PAGE_SIZE }),
      after: t.arg.string({
        required: false,
        description: "Activity ID cursor; return activities older than this",
      }),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args) => {
      const first = Math.min(Math.max(1, args.first ?? ACTIVITY_PAGE_SIZE), 100);
      const where: Record<string, unknown> = {};
      if (args.projectId) where.projectId = args.projectId;

      const include = {
        profile: true,
        task: true,
      };

      if (args.after) {
        const cursor = await prisma.activity.findFirst({
          where: { id: args.after },
          select: { createdAt: true },
        });
        if (!cursor) return { activities: [], hasMore: false };
        where.createdAt = { lt: cursor.createdAt };
      }

      const rows = await prisma.activity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: first + 1,
        include,
      });

      const hasMore = rows.length > first;
      const activities = hasMore ? rows.slice(0, first) : rows;
      return { activities, hasMore };
    },
  }),
);

builder.queryField("activitiesByTask", (t) =>
  t.prismaField({
    type: ["Activity"],
    args: {
      taskId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 50 }),
    },
    resolve: (query, _root, args) =>
      activityModel.findMany({
        ...query,
        where: { taskId: args.taskId },
        orderBy: { createdAt: "desc" },
        take: args.limit ?? 50,
      }),
  }),
);

builder.queryField("activitiesByAgent", (t) =>
  t.prismaField({
    type: ["Activity"],
    args: {
      agentId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 50 }),
    },
    resolve: async (query, _root, args) => {
      const profileId = await getOrCreateAgentProfileId(args.agentId);
      return activityModel.findMany({
        ...query,
        where: { profileId },
        orderBy: { createdAt: "desc" },
        take: args.limit ?? 50,
      });
    },
  }),
);

builder.queryField("activitiesForAgent", (t) =>
  t.prismaField({
    type: ["Activity"],
    args: {
      agentId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 100 }),
      projectId: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const agent = await agentModel.findById(args.agentId);
      if (!agent) return [];

      const isLead = agent.role === Roles.SQUAD_LEAD;

      if (isLead) {
        return activityModel.findMany({
          ...query,
          where: args.projectId ? { projectId: args.projectId } : {},
          orderBy: { createdAt: "desc" },
          take: args.limit ?? 100,
        });
      }

      // Non-leads see only activities for tasks they're assigned to
      const profileId = await getOrCreateAgentProfileId(agent.id);
      return activityModel.findMany({
        ...query,
        where: {
          ...(args.projectId ? { projectId: args.projectId } : {}),
          task: {
            assignees: { some: { profileId } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: args.limit ?? 100,
      });
    },
  }),
);
