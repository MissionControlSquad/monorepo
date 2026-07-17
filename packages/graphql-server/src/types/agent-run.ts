import { builder } from "../builder";

// Tier D: the run ledger — one row per agent execution (sandbox/runner/…). Output is the run's own
// captured stdout/stderr; exposed to member+ under the RUNNERS gate at the query layer.
builder.prismaObject("AgentRun", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    agentId: t.exposeString("agentId", { nullable: true }),
    taskId: t.exposeString("taskId", { nullable: true }),
    kind: t.exposeString("kind"),
    providerKey: t.exposeString("providerKey", { nullable: true }),
    sandboxId: t.exposeString("sandboxId", { nullable: true }),
    status: t.exposeString("status"),
    exitCode: t.exposeInt("exitCode", { nullable: true }),
    stdout: t.exposeString("stdout", { nullable: true }),
    stderr: t.exposeString("stderr", { nullable: true }),
    errorMessage: t.exposeString("errorMessage", { nullable: true }),
    costCents: t.exposeInt("costCents", { nullable: true }),
    startedAt: t.expose("startedAt", { type: "DateTime" }),
    finishedAt: t.expose("finishedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
