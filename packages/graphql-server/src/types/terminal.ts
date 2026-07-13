import { builder } from "../builder";

// Epic #9: terminal sessions. connectTokenHash is NEVER declared as a field — the connect token is
// only ever returned once, from the openTerminalSession mutation.
builder.prismaObject("TerminalSession", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    agentId: t.exposeString("agentId", { nullable: true }),
    label: t.exposeString("label", { nullable: true }),
    connectionType: t.exposeString("connectionType"),
    status: t.exposeString("status"),
    username: t.exposeString("username", { nullable: true }),
    host: t.exposeString("host", { nullable: true }),
    port: t.exposeInt("port", { nullable: true }),
    cwd: t.exposeString("cwd", { nullable: true }),
    connectExpiresAt: t.expose("connectExpiresAt", { type: "DateTime" }),
    sessionExpiresAt: t.expose("sessionExpiresAt", { type: "DateTime" }),
    lastActivityAt: t.expose("lastActivityAt", { type: "DateTime", nullable: true }),
    closedAt: t.expose("closedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
