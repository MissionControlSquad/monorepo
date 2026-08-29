import { builder } from "../builder";
import { taskModel, messageModel, deliverableModel } from "../../models";
import { toSearchQuery } from "./search-utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

const SearchResultsType = builder.simpleObject("SearchResults", {
  fields: (t) => ({
    tasks: t.field({ type: ["JSON"] }),
    messages: t.field({ type: ["JSON"] }),
    deliverables: t.field({ type: ["JSON"] }),
  }),
});

const EMPTY_RESULTS = { tasks: [], messages: [], deliverables: [] };

builder.queryField("globalSearch", (t) =>
  t.field({
    type: SearchResultsType,
    args: {
      searchText: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 5 }),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args) => {
      const { searchText, projectId } = args;
      const limit = args.limit ?? 5;
      const projectFilter = projectId ? { projectId } : {};

      const query = toSearchQuery(searchText);
      if (!query) return EMPTY_RESULTS;

      const [tasks, messages, deliverables] = await Promise.all([
        taskModel.findMany({
          where: {
            OR: [{ title: { search: query } }, { description: { search: query } }],
            ...projectFilter,
          },
          take: limit,
          orderBy: { updatedAt: "desc" },
        }),
        messageModel.findMany({
          where: {
            content: { search: query },
            ...(projectId ? { task: { projectId } } : {}),
          },
          include: { task: { select: { title: true, taskNumber: true } } },
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        deliverableModel.findMany({
          where: {
            OR: [{ title: { search: query } }, { content: { search: query } }],
            ...(projectId ? { task: { projectId } } : {}),
          },
          include: { task: { select: { title: true, taskNumber: true } } },
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      return { tasks, messages, deliverables };
    },
  }),
);

// Full-page search: workspace-scoped, across six entity scopes. Separate from the header typeahead
// (globalSearch) so the typeahead stays cheap. tasks/messages/deliverables are scoped through their
// project's workspace; agents/projects/goals carry workspaceId directly.
const SearchAllResultsType = builder.simpleObject("SearchAllResults", {
  fields: (t) => ({
    tasks: t.field({ type: ["JSON"] }),
    messages: t.field({ type: ["JSON"] }),
    deliverables: t.field({ type: ["JSON"] }),
    agents: t.field({ type: ["JSON"] }),
    projects: t.field({ type: ["JSON"] }),
    goals: t.field({ type: ["JSON"] }),
  }),
});

const EMPTY_ALL = {
  tasks: [],
  messages: [],
  deliverables: [],
  agents: [],
  projects: [],
  goals: [],
};

builder.queryField("searchAll", (t) =>
  t.field({
    type: SearchAllResultsType,
    args: {
      searchText: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 20 }),
    },
    resolve: async (_root, args, ctx) => {
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const ws = tenancy.workspaceId;
      const take = Math.min(Math.max(args.limit ?? 20, 1), 50);
      const query = toSearchQuery(args.searchText);
      if (!query) return EMPTY_ALL;

      const inWs = { project: { workspaceId: ws } };
      const [tasks, messages, deliverables, agents, projects, goals] = await Promise.all([
        ctx.prisma.task.findMany({
          where: {
            OR: [{ title: { search: query } }, { description: { search: query } }],
            ...inWs,
          },
          take,
          orderBy: { updatedAt: "desc" },
        }),
        ctx.prisma.message.findMany({
          where: { content: { search: query }, task: inWs },
          include: { task: { select: { title: true, taskNumber: true } } },
          take,
          orderBy: { createdAt: "desc" },
        }),
        ctx.prisma.deliverable.findMany({
          where: {
            OR: [{ title: { search: query } }, { content: { search: query } }],
            task: inWs,
          },
          include: { task: { select: { title: true, taskNumber: true } } },
          take,
          orderBy: { createdAt: "desc" },
        }),
        ctx.prisma.agent.findMany({
          where: {
            workspaceId: ws,
            OR: [{ name: { search: query } }, { role: { search: query } }],
          },
          take,
          orderBy: { updatedAt: "desc" },
        }),
        ctx.prisma.project.findMany({
          where: {
            workspaceId: ws,
            OR: [{ name: { search: query } }, { description: { search: query } }],
          },
          take,
          orderBy: { updatedAt: "desc" },
        }),
        ctx.prisma.goal.findMany({
          where: {
            workspaceId: ws,
            OR: [{ title: { search: query } }, { description: { search: query } }],
          },
          take,
          orderBy: { updatedAt: "desc" },
        }),
      ]);

      return { tasks, messages, deliverables, agents, projects, goals };
    },
  }),
);
