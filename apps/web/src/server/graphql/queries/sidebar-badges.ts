import { builder } from "../builder";
import { requireRole, scoped } from "@/server/tenancy";

// Paperclip parity (server/src/services/sidebar-badges.ts): lightweight actionable counts to badge
// the sidebar nav — how much is waiting on the human, at a glance. Member+; workspace-scoped for the
// scoped models (approvals/incidents), global for tasks/decompositions (which carry no workspaceId,
// matching tasksByStatus). All plain counts, so it's cheap to poll.
const SidebarBadgesType = builder.simpleObject("SidebarBadges", {
  fields: (t) => ({
    approvals: t.int(), // pending approvals
    review: t.int(), // everything in the /review inbox (tasks-in-review + approvals + decompositions + incidents)
    attention: t.int(), // blocked tasks — the distinctive part of the attention feed
  }),
});

builder.queryField("sidebarBadges", (t) =>
  t.field({
    type: SidebarBadgesType,
    resolve: async (_root, _args, ctx) => {
      requireRole(ctx, "member");
      const [approvals, decompositions, incidents, tasksInReview, blockedTasks] = await Promise.all(
        [
          ctx.prisma.approval.count({ where: scoped(ctx, { status: "pending" as never }) }),
          ctx.prisma.planDecomposition.count({ where: { status: "proposed" as never } }),
          ctx.prisma.budgetIncident.count({ where: scoped(ctx, { status: "open" as never }) }),
          ctx.prisma.task.count({ where: { status: "review" as never } }),
          ctx.prisma.task.count({ where: { status: "blocked" as never } }),
        ],
      );
      return {
        approvals,
        review: tasksInReview + approvals + decompositions + incidents,
        attention: blockedTasks,
      };
    },
  }),
);
