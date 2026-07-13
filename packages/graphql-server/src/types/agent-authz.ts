import { builder } from "../builder";

// Epic #21: agent capability grants + authz audit.
builder.prismaObject("AgentCapabilityGrant", {
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId"),
    capability: t.exposeString("capability"),
    projectScope: t.exposeString("projectScope", { nullable: true }),
    grantedByProfileId: t.exposeString("grantedByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("AgentAuthzEvent", {
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId"),
    capability: t.exposeString("capability"),
    decision: t.exposeString("decision"),
    projectScope: t.exposeString("projectScope", { nullable: true }),
    reason: t.exposeString("reason", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
