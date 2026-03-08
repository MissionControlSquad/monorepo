import { builder } from "../builder";
import { taskTemplateModel } from "../../models";

builder.queryField("taskTemplates", (t) =>
  t.prismaField({
    type: ["TaskTemplate"],
    resolve: (query) =>
      taskTemplateModel.findMany({
        ...query,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
  }),
);

builder.queryField("taskTemplate", (t) =>
  t.prismaField({
    type: "TaskTemplate",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => taskTemplateModel.findById(args.id, query),
  }),
);
