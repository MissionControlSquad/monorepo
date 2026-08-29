import { builder } from "../builder";

// WorkspaceRuntimeService — a long-lived dev/preview process tracked in an execution workspace.
// LOCAL_SERVICES-gated, workspace-scoped. Exposes only safe operational fields (no metadata blob).
builder.prismaObject("WorkspaceRuntimeService", {
  fields: (t) => ({
    id: t.exposeID("id"),
    executionWorkspaceId: t.exposeString("executionWorkspaceId"),
    name: t.exposeString("name"),
    command: t.exposeString("command"),
    port: t.exposeInt("port", { nullable: true }),
    reuseKey: t.exposeString("reuseKey"),
    status: t.exposeString("status"),
    healthCheckUrl: t.exposeString("healthCheckUrl", { nullable: true }),
    healthStatus: t.exposeString("healthStatus", { nullable: true }),
    lastHealthAt: t.expose("lastHealthAt", { type: "DateTime", nullable: true }),
    stopPolicy: t.exposeString("stopPolicy"),
    pid: t.exposeInt("pid", { nullable: true }),
    providerRef: t.exposeString("providerRef", { nullable: true }),
    stopReason: t.exposeString("stopReason", { nullable: true }),
    lastUsedAt: t.expose("lastUsedAt", { type: "DateTime" }),
    startedAt: t.expose("startedAt", { type: "DateTime", nullable: true }),
    stoppedAt: t.expose("stoppedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
