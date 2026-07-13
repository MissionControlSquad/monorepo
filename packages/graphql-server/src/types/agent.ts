import { builder } from "../builder";
import { CURRENT_CONFIG_VERSION } from "../config-version";

builder.prismaObject("Agent", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    role: t.exposeString("role"),
    status: t.exposeString("status"),
    reportsToAgentId: t.exposeString("reportsToAgentId", { nullable: true }), // Epic #19
    detailedStatus: t.exposeString("detailedStatus", { nullable: true }),
    statusMessage: t.exposeString("statusMessage", { nullable: true }),
    currentTaskId: t.exposeString("currentTaskId", { nullable: true }),
    currentTask: t.exposeString("currentTask", { nullable: true }),
    avatar: t.exposeString("avatar", { nullable: true }),
    personality: t.exposeString("personality", { nullable: true }),
    workspacePath: t.exposeString("workspacePath", { nullable: true }),
    identityEmoji: t.exposeString("identityEmoji", { nullable: true }),
    level: t.exposeString("level", { nullable: true }),
    username: t.exposeString("username", { nullable: true }),
    lastHeartbeat: t.expose("lastHeartbeat", { type: "DateTime", nullable: true }),
    setupStatus: t.exposeString("setupStatus"),
    apiKeyPrefix: t.exposeString("apiKeyPrefix", { nullable: true }),
    templateId: t.exposeString("templateId", { nullable: true }),
    configVersion: t.exposeString("configVersion", { nullable: true }),
    isOnVacation: t.exposeBoolean("isOnVacation"),
    createdBy: t.exposeString("createdBy", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    currentConfigVersion: t.string({
      resolve: () => CURRENT_CONFIG_VERSION,
      description: "Current system config version; bump when HEARTBEAT/PLAYBOOK or APIs change.",
    }),
    upgradeAvailable: t.boolean({
      resolve: (agent) =>
        agent.configVersion == null || agent.configVersion !== CURRENT_CONFIG_VERSION,
      description:
        "True when this agent has never reported a config version (old HEARTBEAT) or reports an older version than current.",
    }),

    hostingType: t.exposeString("hostingType"),
    cloudVmId: t.exposeString("cloudVmId", { nullable: true }),

    // Epic #2: pluggable provider adapter.
    adapterType: t.exposeString("adapterType", { nullable: true }),
    adapterConfig: t.expose("adapterConfig", { type: "JSON", nullable: true }),

    // Relations
    profile: t.relation("profile", { nullable: true }),
    cloudVm: t.relation("cloudVm", { nullable: true }),
    adapter: t.relation("adapter", { nullable: true }),
    currentTaskRef: t.relation("currentTaskRef", { nullable: true }),
    queueItems: t.relation("queueItems"),
    statusHistory: t.relation("statusHistory"),
    agentActions: t.relation("agentActions"),
    notifications: t.relation("notifications"),
  }),
});
