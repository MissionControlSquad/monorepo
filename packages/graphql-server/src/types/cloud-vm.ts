import { builder } from "../builder";

builder.prismaObject("CloudVM", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name", { nullable: true }),
    status: t.exposeString("status"),
    ipv4: t.exposeString("ipv4", { nullable: true }),
    region: t.exposeString("region"),
    serverType: t.exposeString("serverType"),
    llmConfigured: t.exposeBoolean("llmConfigured"),
    llmProvider: t.exposeString("llmProvider", { nullable: true }),
    llmModel: t.exposeString("llmModel", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),

    // ── Live Gateway fields ───────────────────────────────────────
    connectionStatus: t.exposeString("connectionStatus"),
    connectedAt: t.expose("connectedAt", { type: "DateTime", nullable: true }),
    lastDisconnectedAt: t.expose("lastDisconnectedAt", { type: "DateTime", nullable: true }),
    pluginVersion: t.exposeString("pluginVersion", { nullable: true }),
    vmFingerprint: t.exposeString("vmFingerprint", { nullable: true }),
  }),
});
