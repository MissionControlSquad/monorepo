import { builder } from "../builder";
import { projectModel } from "../../models";
import { projectContextCache, projectsListCache } from "../../cache";
import { getOrCreateAgentProfileId } from "../../agent-profile";

builder.queryField("projects", (t) =>
  t.prismaField({
    type: ["Project"],
    resolve: async (query) => {
      const cacheKey = JSON.stringify(query);
      const cached = projectsListCache.get(cacheKey);
      if (cached) return cached;

      const result = await projectModel.findMany({
        ...query,
        where: {},
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      projectsListCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("project", (t) =>
  t.prismaField({
    type: "Project",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      projectModel.delegate.findUnique({
        ...query,
        where: { id: args.id },
        include: { members: { where: { status: "active" }, include: { profile: true } } },
      }),
  }),
);

builder.queryField("projectsByAgent", (t) =>
  t.prismaField({
    type: ["Project"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args) => {
      const profileId = await getOrCreateAgentProfileId(args.agentId);
      return projectModel.findMany({
        ...query,
        where: {
          status: "active",
          members: { some: { profileId } },
        },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("projectContext", (t) =>
  t.field({
    type: "JSON",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args) => {
      const cached = projectContextCache.get(args.id);
      if (cached) return cached;

      const project = await projectModel.delegate.findUnique({
        where: { id: args.id },
        include: {
          projectDocs: {
            select: { id: true, title: true, summary: true },
          },
        },
      });
      if (!project) return null;
      const result = {
        name: project.name,
        description: project.description,
        docs: project.projectDocs,
      };
      projectContextCache.set(args.id, result);
      return result;
    },
  }),
);
