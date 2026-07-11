import { builder } from "../builder";

// Epic #8: task autonomy types.
builder.prismaObject("PlanDecomposition", {
  fields: (t) => ({
    id: t.exposeID("id"),
    parentTaskId: t.exposeString("parentTaskId"),
    status: t.exposeString("status"),
    plan: t.expose("plan", { type: "JSON" }),
    generatedByAgentId: t.exposeString("generatedByAgentId", { nullable: true }),
    reviewedByProfileId: t.exposeString("reviewedByProfileId", { nullable: true }),
    appliedAt: t.expose("appliedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("TaskTreeHold", {
  fields: (t) => ({
    id: t.exposeID("id"),
    rootTaskId: t.exposeString("rootTaskId"),
    reason: t.exposeString("reason"),
    heldByProfileId: t.exposeString("heldByProfileId", { nullable: true }),
    isActive: t.exposeBoolean("isActive"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    releasedAt: t.expose("releasedAt", { type: "DateTime", nullable: true }),
  }),
});

builder.prismaObject("TaskRecoveryAction", {
  fields: (t) => ({
    id: t.exposeID("id"),
    taskId: t.exposeString("taskId"),
    detectedBy: t.exposeString("detectedBy"),
    reason: t.exposeString("reason"),
    status: t.exposeString("status"),
    resolution: t.exposeString("resolution", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    resolvedAt: t.expose("resolvedAt", { type: "DateTime", nullable: true }),
  }),
});

builder.prismaObject("TaskWatchdog", {
  fields: (t) => ({
    id: t.exposeID("id"),
    taskId: t.exposeString("taskId"),
    scope: t.exposeString("scope"),
    condition: t.exposeString("condition"),
    thresholdSec: t.exposeInt("thresholdSec"),
    action: t.exposeString("action"),
    isEnabled: t.exposeBoolean("isEnabled"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
