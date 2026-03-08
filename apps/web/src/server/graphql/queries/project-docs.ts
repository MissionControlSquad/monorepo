import { builder } from "../builder";
import { projectDocModel, projectDocRevisionModel } from "../../models";

builder.queryField("projectDocsByProject", (t) =>
  t.prismaField({
    type: ["ProjectDoc"],
    args: { projectId: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      projectDocModel.findMany({
        ...query,
        where: { projectId: args.projectId },
        select: {
          ...query.select,
          id: true,
          title: true,
          summary: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
  }),
);

builder.queryField("projectDoc", (t) =>
  t.prismaField({
    type: "ProjectDoc",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => projectDocModel.findById(args.id, query),
  }),
);

builder.queryField("projectDocRevisions", (t) =>
  t.prismaField({
    type: ["ProjectDocRevision"],
    args: { docId: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      projectDocRevisionModel.findMany({
        ...query,
        where: { docId: args.docId },
        orderBy: { createdAt: "desc" },
      }),
  }),
);

builder.queryField("projectDocRevision", (t) =>
  t.prismaField({
    type: "ProjectDocRevision",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => projectDocRevisionModel.findById(args.id, query),
  }),
);
