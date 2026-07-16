import { builder } from "../builder";

// Tier D: a raw shell/CLI job on a runner (server-SSH or agent-daemon pull).
builder.prismaObject("RunnerCommand", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    targetKind: t.exposeString("targetKind"),
    targetId: t.exposeString("targetId"),
    command: t.exposeString("command"),
    cwd: t.exposeString("cwd", { nullable: true }),
    timeoutMs: t.exposeInt("timeoutMs"),
    status: t.exposeString("status"),
    exitCode: t.exposeInt("exitCode", { nullable: true }),
    stdout: t.exposeString("stdout", { nullable: true }),
    stderr: t.exposeString("stderr", { nullable: true }),
    errorMessage: t.exposeString("errorMessage", { nullable: true }),
    requestedByProfileId: t.exposeString("requestedByProfileId", { nullable: true }),
    startedAt: t.expose("startedAt", { type: "DateTime", nullable: true }),
    finishedAt: t.expose("finishedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
