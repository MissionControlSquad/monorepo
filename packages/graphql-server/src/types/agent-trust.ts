import { builder } from "../builder";

// Epic #3: AgentTrustProfile (per-agent trust — agent-domain, not human RBAC).
builder.prismaObject("AgentTrustProfile", {
  fields: (t) => ({
    agentId: t.exposeID("agentId"),
    workspaceId: t.exposeString("workspaceId"),
    trustLevel: t.exposeString("trustLevel"),
    lowTrustContainment: t.exposeBoolean("lowTrustContainment"),
    requireUntrustedPrReview: t.exposeBoolean("requireUntrustedPrReview"),
    autoPromoteWorkProduct: t.exposeBoolean("autoPromoteWorkProduct"),
    sourceTrustBadge: t.exposeString("sourceTrustBadge", { nullable: true }),
    changeConsentRequired: t.exposeBoolean("changeConsentRequired"),
    executionAllowlist: t.exposeStringList("executionAllowlist"),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
