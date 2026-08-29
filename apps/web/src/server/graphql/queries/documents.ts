import { builder } from "../builder";
import { documentModel } from "../../models";

// Parity §3.12 — list a document's revision history (newest first).
builder.queryField("documentRevisions", (t) =>
  t.prismaField({
    type: ["DocumentRevision"],
    args: { documentId: t.arg.string({ required: true }) },
    resolve: (query, _root, args, ctx) =>
      ctx.prisma.documentRevision.findMany({
        ...query,
        where: { documentId: args.documentId },
        orderBy: { revision: "desc" },
      }),
  }),
);

builder.queryField("documents", (t) =>
  t.prismaField({
    type: ["Document"],
    args: { limit: t.arg.int({ defaultValue: 100 }) },
    resolve: (query, _root, args) =>
      documentModel.findMany({
        ...query,
        orderBy: { createdAt: "desc" },
        take: args.limit ?? 100,
      }),
  }),
);

builder.queryField("document", (t) =>
  t.prismaField({
    type: "Document",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => documentModel.findById(args.id, query),
  }),
);

builder.queryField("documentsByTask", (t) =>
  t.prismaField({
    type: ["Document"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      documentModel.findMany({
        ...query,
        where: { taskId: args.taskId },
        orderBy: { createdAt: "desc" },
      }),
  }),
);

builder.queryField("documentsByType", (t) =>
  t.prismaField({
    type: ["Document"],
    args: { type: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      documentModel.findMany({
        ...query,
        where: { type: args.type as any },
        orderBy: { createdAt: "desc" },
      }),
  }),
);
