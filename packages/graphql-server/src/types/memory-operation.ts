import { builder } from "../builder";

// Tier D / Domain 4: memory operations audit log — one row per memory op (capture/query/…), the
// surface cost + inspect hang off. Exposed to member+ under the MEMORY gate at the query layer.
builder.prismaObject("MemoryOperation", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    agentId: t.exposeString("agentId", { nullable: true }),
    provider: t.exposeString("provider"),
    opType: t.exposeString("opType"),
    projectId: t.exposeString("projectId", { nullable: true }),
    taskId: t.exposeString("taskId", { nullable: true }),
    runId: t.exposeString("runId", { nullable: true }),
    subjectId: t.exposeString("subjectId", { nullable: true }),
    sourceKind: t.exposeString("sourceKind", { nullable: true }),
    sourceRefId: t.exposeString("sourceRefId", { nullable: true }),
    success: t.exposeBoolean("success"),
    error: t.exposeString("error", { nullable: true }),
    latencyMs: t.exposeInt("latencyMs", { nullable: true }),
    resultCount: t.exposeInt("resultCount", { nullable: true }),
    costCents: t.exposeInt("costCents", { nullable: true }),
    attributionMode: t.exposeString("attributionMode", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

// The db-provider's stored memory entries (with provenance). member+ under MEMORY at the query layer.
builder.prismaObject("AgentMemory", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    agentId: t.exposeString("agentId"),
    content: t.exposeString("content"),
    sourceTaskId: t.exposeString("sourceTaskId", { nullable: true }),
    sourceKind: t.exposeString("sourceKind", { nullable: true }),
    sourceRefId: t.exposeString("sourceRefId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
