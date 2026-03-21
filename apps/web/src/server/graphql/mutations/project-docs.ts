import { builder } from "../builder";
import { projectModel, projectDocModel, projectDocRevisionModel } from "../../models";
import { invalidateProjectContext } from "../../cache";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";

builder.mutationField("createProjectDoc", (t) =>
  t.prismaField({
    type: "ProjectDoc",
    args: {
      projectId: t.arg.string({ required: true }),
      title: t.arg.string({ required: true }),
      content: t.arg.string({ required: true }),
      summary: t.arg.string(),
      addedById: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      const project = await projectModel.findById(args.projectId, { select: { status: true } });
      if (project?.status === "archived") {
        throw new Error("Cannot modify docs of an archived project");
      }

      const doc = await projectDocModel.create({
        ...query,
        data: {
          projectId: args.projectId,
          title: args.title,
          content: args.content,
          summary: args.summary ?? undefined,
          addedById: args.addedById ?? undefined,
        },
      });

      // Save initial revision
      await projectDocRevisionModel.create({
        data: {
          docId: doc.id,
          title: doc.title,
          summary: doc.summary ?? undefined,
          content: doc.content,
          editedById: args.addedById ?? undefined,
          editAction: "created",
        },
      });

      invalidateProjectContext(args.projectId);
      return doc;
    },
  }),
);

builder.mutationField("updateProjectDoc", (t) =>
  t.prismaField({
    type: "ProjectDoc",
    args: {
      id: t.arg.string({ required: true }),
      title: t.arg.string(),
      content: t.arg.string(),
      summary: t.arg.string(),
      editedById: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      // Save pre-edit snapshot as revision
      const current = await projectDocModel.delegate.findUniqueOrThrow({
        where: { id: args.id },
      });

      const project = await projectModel.findById(current.projectId, { select: { status: true } });
      if (project?.status === "archived") {
        throw new Error("Cannot modify docs of an archived project");
      }

      await projectDocRevisionModel.create({
        data: {
          docId: current.id,
          title: current.title,
          summary: current.summary ?? undefined,
          content: current.content,
          editedById: args.editedById ?? undefined,
          editAction: "updated",
        },
      });

      invalidateProjectContext(current.projectId);
      return projectDocModel.update(args.id, {
        ...query,
        data: {
          ...(args.title ? { title: args.title } : {}),
          ...(args.content ? { content: args.content } : {}),
          ...(args.summary !== undefined ? { summary: args.summary } : {}),
        },
      });
    },
  }),
);

builder.mutationField("deleteProjectDoc", (t) =>
  t.field({
    type: "Boolean",
    args: {
      id: t.arg.string({ required: true }),
      editedById: t.arg.string(),
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.DOCUMENTS);
      const doc = await projectDocModel.delegate.findUniqueOrThrow({
        where: { id: args.id },
      });

      const project = await projectModel.findById(doc.projectId, { select: { status: true } });
      if (project?.status === "archived") {
        throw new Error("Cannot modify docs of an archived project");
      }

      // Save final snapshot
      await projectDocRevisionModel.create({
        data: {
          docId: doc.id,
          title: doc.title,
          summary: doc.summary ?? undefined,
          content: doc.content,
          editedById: args.editedById ?? undefined,
          editAction: "deleted",
        },
      });

      await projectDocModel.deleteById(args.id);
      invalidateProjectContext(doc.projectId);
      return true;
    },
  }),
);
