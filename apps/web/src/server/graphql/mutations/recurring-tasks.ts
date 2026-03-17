import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "../../../lib/feature-flag-keys";
import { recurringTaskModel } from "../../models";
import { validateRecurrenceConfig, calculateInitialDueDate } from "../../recurring-tasks";
import { getOrCreateAgentProfileId } from "../../agent-profile";
import { assertAssignableAgents } from "../../assignment-guard";
import { assertProjectWritable } from "../../system-settings";

builder.mutationField("createRecurringTask", (t) =>
  t.prismaField({
    type: "RecurringTask",
    args: {
      title: t.arg.string({ required: true }),
      description: t.arg.string({ required: true }),
      recurrenceConfig: t.arg.string({ required: true }), // JSON string
      status: t.arg.string(),
      priority: t.arg.string(),
      tags: t.arg.stringList(),
      timezone: t.arg.string(),
      assigneeIds: t.arg.stringList(),
      projectId: t.arg.string(),
      createdByProfileId: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.RECURRING_TASKS);
      if (args.projectId) await assertProjectWritable(args.projectId);

      const config = validateRecurrenceConfig(JSON.parse(args.recurrenceConfig));
      const timezone = args.timezone ?? "UTC";
      const nextDueAt = calculateInitialDueDate(config, timezone);

      const assigneeIds = args.assigneeIds ?? [];
      await assertAssignableAgents(assigneeIds);

      const assigneeProfileIds = await Promise.all(
        assigneeIds.map((id) => getOrCreateAgentProfileId(id)),
      );

      return recurringTaskModel.delegate.create({
        ...query,
        data: {
          title: args.title,
          description: args.description,
          recurrenceConfig: config as any,
          status: (args.status as any) ?? undefined,
          priority: (args.priority as any) ?? undefined,
          tags: args.tags ?? [],
          timezone: args.timezone ?? "UTC",
          nextDueAt,
          projectId: args.projectId ?? undefined,
          createdByProfileId: args.createdByProfileId ?? undefined,
          assignees: {
            create: assigneeProfileIds.map((profileId) => ({ profileId })),
          },
        },
      });
    },
  }),
);

builder.mutationField("updateRecurringTask", (t) =>
  t.prismaField({
    type: "RecurringTask",
    args: {
      id: t.arg.string({ required: true }),
      title: t.arg.string(),
      description: t.arg.string(),
      recurrenceConfig: t.arg.string(), // JSON string
      status: t.arg.string(),
      priority: t.arg.string(),
      tags: t.arg.stringList(),
      timezone: t.arg.string(),
      assigneeIds: t.arg.stringList(),
      projectId: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.RECURRING_TASKS);
      if (args.projectId) await assertProjectWritable(args.projectId);

      const data: Record<string, unknown> = {};

      if (args.title !== undefined && args.title !== null) data.title = args.title;
      if (args.description !== undefined && args.description !== null)
        data.description = args.description;
      if (args.status !== undefined && args.status !== null) data.status = args.status;
      if (args.priority !== undefined) data.priority = args.priority;
      if (args.tags !== undefined && args.tags !== null) data.tags = args.tags;
      if (args.timezone !== undefined && args.timezone !== null) data.timezone = args.timezone;
      if (args.projectId !== undefined) data.projectId = args.projectId;

      if (args.recurrenceConfig) {
        const config = validateRecurrenceConfig(JSON.parse(args.recurrenceConfig));
        data.recurrenceConfig = config as any;
        // Recalculate nextDueAt when config changes, using the new or existing timezone
        const existing = await recurringTaskModel.delegate.findUniqueOrThrow({
          where: { id: args.id },
          select: { timezone: true },
        });
        const timezone = (args.timezone as string) ?? existing.timezone ?? "UTC";
        data.nextDueAt = calculateInitialDueDate(config, timezone);
      }

      const updated = await recurringTaskModel.delegate.update({
        ...query,
        where: { id: args.id },
        data,
      });

      // Handle assignees if provided
      if (args.assigneeIds) {
        await assertAssignableAgents(args.assigneeIds);
        const profileIds = await Promise.all(
          args.assigneeIds.map((id) => getOrCreateAgentProfileId(id)),
        );
        await recurringTaskModel.setAssignees(args.id, profileIds);
      }

      return updated;
    },
  }),
);

builder.mutationField("pauseRecurringTask", (t) =>
  t.prismaField({
    type: "RecurringTask",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.RECURRING_TASKS);
      await recurringTaskModel.pause(args.id);
      return recurringTaskModel.delegate.findUniqueOrThrow({
        ...query,
        where: { id: args.id },
      });
    },
  }),
);

builder.mutationField("resumeRecurringTask", (t) =>
  t.prismaField({
    type: "RecurringTask",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.RECURRING_TASKS);
      await recurringTaskModel.resume(args.id);
      return recurringTaskModel.delegate.findUniqueOrThrow({
        ...query,
        where: { id: args.id },
      });
    },
  }),
);

builder.mutationField("triggerRecurringTask", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.RECURRING_TASKS);
      const { triggerRecurringTaskNow } = await import("../../recurring-tasks");
      await triggerRecurringTaskNow(args.id);
      return true;
    },
  }),
);

builder.mutationField("deleteRecurringTask", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.RECURRING_TASKS);
      await recurringTaskModel.deleteById(args.id);
      return true;
    },
  }),
);
