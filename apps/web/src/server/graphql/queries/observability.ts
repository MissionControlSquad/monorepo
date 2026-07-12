import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { getWorkspaceSummary } from "@/server/services/observability";

// Epic #13: workspace observability summary. OBSERVABILITY-gated, member, workspace-scoped.
const AgentSummary = builder.simpleObject("AgentSummary", {
  fields: (t) => ({
    total: t.int(),
    operational: t.int(),
    blocked: t.int(),
    idle: t.int(),
    active: t.int(),
  }),
});

const TaskSummary = builder.simpleObject("TaskSummary", {
  fields: (t) => ({
    total: t.int(),
    open: t.int(),
    inProgress: t.int(),
    review: t.int(),
    blocked: t.int(),
    done: t.int(),
  }),
});

const WorkspaceSummary = builder.simpleObject("WorkspaceSummary", {
  fields: (t) => ({
    agents: t.field({ type: AgentSummary }),
    tasks: t.field({ type: TaskSummary }),
    monthSpendCents: t.int(),
    pendingApprovals: t.int(),
    activeBudgetIncidents: t.int(),
  }),
});

builder.queryField("workspaceSummary", (t) =>
  t.field({
    type: WorkspaceSummary,
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.OBSERVABILITY);
      const tenancy = requireRole(ctx, "member");
      return getWorkspaceSummary(tenancy.workspaceId);
    },
  }),
);
