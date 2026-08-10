import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";

// Parity §3.12 — a task's first-class labels. TASK_AUTONOMY-gated.
builder.queryField("taskLabels", (t) =>
  t.prismaField({
    type: ["TaskLabel"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      return ctx.prisma.taskLabel.findMany({
        ...query,
        where: { taskId: args.taskId },
        orderBy: { createdAt: "asc" },
      });
    },
  }),
);
