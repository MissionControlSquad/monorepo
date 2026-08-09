import { builder } from "../builder";

// Tier C: workspace health monitor.
builder.prismaObject("Monitor", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    metric: t.exposeString("metric"),
    comparator: t.exposeString("comparator"),
    threshold: t.exposeInt("threshold"),
    isActive: t.exposeBoolean("isActive"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
