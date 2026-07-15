import { builder } from "../builder";

// Epic #7: routines + pipelines types.
builder.prismaObject("Routine", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    definition: t.expose("definition", { type: "JSON" }),
    isActive: t.exposeBoolean("isActive"),
    timezone: t.exposeString("timezone"),
    currentVersion: t.exposeInt("currentVersion"),
    projectId: t.exposeString("projectId", { nullable: true }),
    assigneeAgentId: t.exposeString("assigneeAgentId", { nullable: true }),
    priority: t.exposeString("priority", { nullable: true }),
    goalId: t.exposeString("goalId", { nullable: true }),
    triggers: t.relation("triggers"),
    revisions: t.relation("revisions"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("RoutineTrigger", {
  fields: (t) => ({
    id: t.exposeID("id"),
    type: t.exposeString("type"),
    recurrenceConfig: t.expose("recurrenceConfig", { type: "JSON", nullable: true }),
    nextFireAt: t.expose("nextFireAt", { type: "DateTime", nullable: true }),
    publicId: t.exposeString("publicId", { nullable: true }),
    isEnabled: t.exposeBoolean("isEnabled"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("RoutineRevision", {
  fields: (t) => ({
    id: t.exposeID("id"),
    version: t.exposeInt("version"),
    definition: t.expose("definition", { type: "JSON" }),
    editedById: t.exposeString("editedById", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("RoutineRun", {
  fields: (t) => ({
    id: t.exposeID("id"),
    routineId: t.exposeString("routineId"),
    triggeredBy: t.exposeString("triggeredBy"),
    status: t.exposeString("status"),
    startedAt: t.expose("startedAt", { type: "DateTime", nullable: true }),
    finishedAt: t.expose("finishedAt", { type: "DateTime", nullable: true }),
    error: t.exposeString("error", { nullable: true }),
    output: t.expose("output", { type: "JSON", nullable: true }),
    generatedTaskId: t.exposeString("generatedTaskId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("Pipeline", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    isActive: t.exposeBoolean("isActive"),
    projectId: t.exposeString("projectId", { nullable: true }),
    stages: t.relation("stages", { query: { orderBy: { order: "asc" } } }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("PipelineStage", {
  fields: (t) => ({
    id: t.exposeID("id"),
    pipelineId: t.exposeString("pipelineId"),
    name: t.exposeString("name"),
    order: t.exposeInt("order"),
    isReviewStage: t.exposeBoolean("isReviewStage"),
    requireApproval: t.exposeBoolean("requireApproval"),
    slaMinutes: t.exposeInt("slaMinutes", { nullable: true }),
  }),
});

builder.prismaObject("PipelineCase", {
  fields: (t) => ({
    id: t.exposeID("id"),
    pipelineId: t.exposeString("pipelineId"),
    currentStageId: t.exposeString("currentStageId", { nullable: true }),
    title: t.exposeString("title"),
    payload: t.expose("payload", { type: "JSON", nullable: true }),
    status: t.exposeString("status"),
    claimedByProfileId: t.exposeString("claimedByProfileId", { nullable: true }),
    claimedAt: t.expose("claimedAt", { type: "DateTime", nullable: true }),
    linkedTaskId: t.exposeString("linkedTaskId", { nullable: true }),
    enteredStageAt: t.expose("enteredStageAt", { type: "DateTime" }),
    currentStage: t.relation("currentStage", { nullable: true }),
    events: t.relation("events", { query: { orderBy: { createdAt: "asc" } } }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("PipelineCaseEvent", {
  fields: (t) => ({
    id: t.exposeID("id"),
    type: t.exposeString("type"),
    fromStageId: t.exposeString("fromStageId", { nullable: true }),
    toStageId: t.exposeString("toStageId", { nullable: true }),
    actorProfileId: t.exposeString("actorProfileId", { nullable: true }),
    note: t.exposeString("note", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
