import { builder } from "../builder";

// Epic #4: agent budgets / cost types.
builder.prismaObject("CostEvent", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    agentId: t.exposeString("agentId", { nullable: true }),
    model: t.exposeString("model", { nullable: true }),
    provider: t.exposeString("provider", { nullable: true }),
    taskId: t.exposeString("taskId", { nullable: true }),
    projectId: t.exposeString("projectId", { nullable: true }),
    billerId: t.exposeString("billerId", { nullable: true }),
    issueId: t.exposeString("issueId", { nullable: true }),
    tokensIn: t.exposeInt("tokensIn"),
    tokensOut: t.exposeInt("tokensOut"),
    amountCents: t.exposeInt("amountCents"),
    source: t.exposeString("source"),
    occurredAt: t.expose("occurredAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("BudgetPolicy", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    scope: t.exposeString("scope"),
    agentId: t.exposeString("agentId", { nullable: true }),
    name: t.exposeString("name"),
    limitCents: t.exposeInt("limitCents"),
    window: t.exposeString("window"),
    hardStop: t.exposeBoolean("hardStop"),
    warnPercent: t.exposeInt("warnPercent"),
    notifyEnabled: t.exposeBoolean("notifyEnabled"),
    isActive: t.exposeBoolean("isActive"),
    windows: t.relation("windows"),
    incidents: t.relation("incidents"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("QuotaWindow", {
  fields: (t) => ({
    id: t.exposeID("id"),
    policyId: t.exposeString("policyId"),
    windowStart: t.expose("windowStart", { type: "DateTime" }),
    windowEnd: t.expose("windowEnd", { type: "DateTime" }),
    spendCents: t.exposeInt("spendCents"),
    warned: t.exposeBoolean("warned"),
    breached: t.exposeBoolean("breached"),
  }),
});

builder.prismaObject("BudgetIncident", {
  fields: (t) => ({
    id: t.exposeID("id"),
    policyId: t.exposeString("policyId"),
    agentId: t.exposeString("agentId", { nullable: true }),
    status: t.exposeString("status"),
    thresholdType: t.exposeString("thresholdType"),
    spendCents: t.exposeInt("spendCents"),
    limitCents: t.exposeInt("limitCents"),
    autoPaused: t.exposeBoolean("autoPaused"),
    approvalId: t.exposeString("approvalId", { nullable: true }),
    detail: t.exposeString("detail", { nullable: true }),
    resolvedById: t.exposeString("resolvedById", { nullable: true }),
    resolvedAt: t.expose("resolvedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
