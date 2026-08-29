import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { evaluateMonitors } from "@/server/services/monitors";

// Tier C: monitors read with LIVE on-demand evaluation. MONITORS-gated, member+.
const MonitorEvaluationType = builder.simpleObject("MonitorEvaluation", {
  fields: (t) => ({
    id: t.string(),
    name: t.string(),
    metric: t.string(),
    comparator: t.string(),
    threshold: t.int(),
    isActive: t.boolean(),
    value: t.int(),
    breached: t.boolean(),
  }),
});

builder.queryField("monitors", (t) =>
  t.field({
    type: [MonitorEvaluationType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.MONITORS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const evals = await evaluateMonitors(tenancy.workspaceId);
      return evals.map((e) => ({
        id: e.monitor.id,
        name: e.monitor.name,
        metric: e.monitor.metric,
        comparator: e.monitor.comparator,
        threshold: e.monitor.threshold,
        isActive: e.monitor.isActive,
        value: e.value,
        breached: e.breached,
      }));
    },
  }),
);
