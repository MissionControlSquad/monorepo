import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { addTaskLabel, removeTaskLabel } from "@/server/services/task-labels";

// Parity §3.12 — attach/detach first-class task labels. TASK_AUTONOMY-gated; workspace-scoped (D5).
builder.mutationField("addTaskLabel", (t) =>
  t.prismaField({
    type: "TaskLabel",
    args: {
      taskId: t.arg.string({ required: true }),
      name: t.arg.string({ required: true }),
      color: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const tl = await addTaskLabel({
        workspaceId: tenancy.workspaceId,
        taskId: args.taskId,
        name: args.name,
        color: args.color ?? null,
      });
      return ctx.prisma.taskLabel.findUniqueOrThrow({ ...query, where: { id: tl.id } });
    },
  }),
);

builder.mutationField("removeTaskLabel", (t) =>
  t.field({
    type: "Boolean",
    args: { taskId: t.arg.string({ required: true }), labelId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return removeTaskLabel({
        workspaceId: tenancy.workspaceId,
        taskId: args.taskId,
        labelId: args.labelId,
      });
    },
  }),
);
