import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { prisma } from "@/server/prisma";

// Work timeline (Gantt) — completed agent work spans across the workspace, for the timeline view.
// Member-visible, workspace-scoped via the session's agent. Portable: bars come from WorkSession
// start/end; richer per-run token/cost overlays are future runtime work.

const WorkTimelineEntry = builder.simpleObject("WorkTimelineEntry", {
  fields: (t) => ({
    id: t.string(),
    agentId: t.string(),
    agentName: t.string(),
    taskId: t.string(),
    taskTitle: t.string(),
    taskNumber: t.int({ nullable: true }),
    startedAt: t.string(),
    endedAt: t.string(),
  }),
});

builder.queryField("workTimeline", (t) =>
  t.field({
    type: [WorkTimelineEntry],
    args: {
      from: t.arg({ type: "DateTime" }),
      to: t.arg({ type: "DateTime" }),
      projectId: t.arg.string(),
      limit: t.arg.int({ defaultValue: 200 }),
    },
    resolve: async (_root, args, ctx) => {
      const tenancy = requireRole(ctx, "member");
      const take = Math.min(Math.max(args.limit ?? 200, 1), 500);
      const rows = await prisma.workSession.findMany({
        where: {
          agent: { workspaceId: tenancy.workspaceId },
          endedAt: { not: null },
          ...(args.projectId ? { projectId: args.projectId } : {}),
          ...(args.from || args.to
            ? {
                startedAt: {
                  ...(args.from ? { gte: args.from } : {}),
                  ...(args.to ? { lte: args.to } : {}),
                },
              }
            : {}),
        },
        include: {
          agent: { select: { name: true } },
          task: { select: { title: true, taskNumber: true } },
        },
        take,
        orderBy: { startedAt: "asc" },
      });

      return rows
        .filter((r) => r.endedAt)
        .map((r) => ({
          id: r.id,
          agentId: r.agentId,
          agentName: r.agent.name,
          taskId: r.taskId,
          taskTitle: r.task.title,
          taskNumber: r.task.taskNumber,
          startedAt: r.startedAt.toISOString(),
          endedAt: r.endedAt!.toISOString(),
        }));
    },
  }),
);
