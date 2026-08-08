import { builder } from "../builder";

// Tool access-policy (parity #21). A declarative allow/deny rule over tool names, workspace-wide
// (agentId null) or per-agent. Read-only over GraphQL: the Agent Detail "Tools" tab renders the
// effective rule set. Mutations live in the service layer, admin-gated when wired.
builder.prismaObject("ToolAccessPolicy", {
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId", { nullable: true }),
    toolPattern: t.exposeString("toolPattern"),
    effect: t.exposeString("effect"),
    priority: t.exposeInt("priority"),
    reason: t.exposeString("reason", { nullable: true }),
    // scope = "agent" when the rule names this agent, "workspace" when it applies to everyone.
    scope: t.string({
      resolve: (policy) => (policy.agentId ? "agent" : "workspace"),
    }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
