import { builder } from "../builder";

// Parity Domain-10 A13 / GAP-5: one-time agent-key claim. claimSecretHash is NEVER declared as a
// field - the secret hash is not exposed via the schema; the one-time secret is only ever returned
// from the createAgentKeyClaim mutation. LIVE_GATEWAY-gated, workspace-scoped.
builder.prismaObject("AgentKeyClaim", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    agentId: t.exposeString("agentId", { nullable: true }),
    label: t.exposeString("label", { nullable: true }),
    status: t.exposeString("status"),
    expiresAt: t.expose("expiresAt", { type: "DateTime" }),
    claimedAt: t.expose("claimedAt", { type: "DateTime", nullable: true }),
    createdByProfileId: t.exposeString("createdByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
