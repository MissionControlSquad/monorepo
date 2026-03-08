import { builder } from "../builder";
import { assertAssignableAgents } from "../../assignment-guard";
import { taskTemplateModel } from "../../models";
import { taskModel } from "../../models/task";
import { TaskStatus } from "../../constants";
import { parseDueDate } from "./tasks";
import { getOrCreateAgentProfileId } from "../../agent-profile";

builder.mutationField("createTaskTemplate", (t) =>
  t.prismaField({
    type: "TaskTemplate",
    args: {
      name: t.arg.string({ required: true }),
      description: t.arg.string(),
      subtasks: t.arg.string({ required: true }), // JSON string
    },
    resolve: (query, _root, args) =>
      taskTemplateModel.delegate.create({
        ...query,
        data: {
          name: args.name,
          description: args.description ?? undefined,
          subtasks: JSON.parse(args.subtasks),
        },
      }),
  }),
);

builder.mutationField("updateTaskTemplate", (t) =>
  t.prismaField({
    type: "TaskTemplate",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      description: t.arg.string(),
      subtasks: t.arg.string(), // JSON string
    },
    resolve: (query, _root, args) =>
      taskTemplateModel.delegate.update({
        ...query,
        where: { id: args.id },
        data: {
          ...(args.name ? { name: args.name } : {}),
          ...(args.description !== undefined ? { description: args.description } : {}),
          ...(args.subtasks ? { subtasks: JSON.parse(args.subtasks) } : {}),
        },
      }),
  }),
);

builder.mutationField("deleteTaskTemplate", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args) => {
      await taskTemplateModel.deleteById(args.id);
      return true;
    },
  }),
);

builder.mutationField("saveTaskAsTemplate", (t) =>
  t.prismaField({
    type: "TaskTemplate",
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args) => {
      const parentTask = await taskModel.findByIdOrThrow(args.taskId, {
        include: { childTasks: true },
      });

      const subtasks = parentTask.childTasks.map((child: any) => ({
        title: child.title,
        description: child.description,
        priority: child.priority,
        tags: child.tags,
      }));

      return taskTemplateModel.delegate.create({
        ...query,
        data: {
          name: parentTask.title,
          description: parentTask.description,
          subtasks,
        },
      });
    },
  }),
);

builder.mutationField("instantiateTemplate", (t) =>
  t.field({
    type: "JSON",
    args: {
      templateId: t.arg.string({ required: true }),
      titleOverride: t.arg.string(),
      priority: t.arg.string(),
      assigneeIds: t.arg.stringList(),
      dueDate: t.arg.string(),
      tags: t.arg.stringList(),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args) => {
      const template = await taskTemplateModel.findByIdOrThrow(args.templateId);
      const assigneeIds = args.assigneeIds ?? [];
      await assertAssignableAgents(assigneeIds);

      const assigneeProfileIds = await Promise.all(
        assigneeIds.map((id) => getOrCreateAgentProfileId(id)),
      );

      const subtasks = template.subtasks as Array<{
        title: string;
        description: string;
        priority?: string;
        tags?: string[];
      }>;

      // Create parent task
      const parentTask = await taskModel.create({
        data: {
          title: args.titleOverride ?? template.name,
          description: template.description ?? "",
          status: TaskStatus.INBOX,
          priority: (args.priority as any) ?? undefined,
          dueDate: parseDueDate(args.dueDate ?? undefined),
          tags: args.tags ?? [],
          projectId: args.projectId ?? undefined,
          assignees: {
            create: assigneeProfileIds.map((profileId) => ({ profileId })),
          },
        },
      });

      await taskModel.emitCreated(parentTask, {
        createdBy: undefined,
        creatorName: undefined,
        assigneeIds,
        fromDashboard: true,
      });

      // Create child tasks
      const childTaskIds: string[] = [];
      for (const sub of subtasks) {
        const child = await taskModel.create({
          data: {
            title: sub.title,
            description: sub.description,
            status: TaskStatus.INBOX,
            priority: (sub.priority as any) ?? undefined,
            tags: sub.tags ?? [],
            parentTaskId: parentTask.id,
            projectId: args.projectId ?? undefined,
          },
        });

        childTaskIds.push(child.id);

        await taskModel.emitCreated(child, {
          createdBy: undefined,
          creatorName: undefined,
          assigneeIds: [],
          fromDashboard: true,
        });
      }

      return { parentTaskId: parentTask.id, childTaskIds };
    },
  }),
);
