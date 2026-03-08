import { builder } from "../builder";
import { taskModel, messageModel, deliverableModel } from "../../models";
import { toSearchQuery } from "./search-utils";

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
