import { builder } from "../builder";

// Human-approved secret proposals (Paperclip #9934 port). SECURITY: never exposes a secret value —
// `placeholderValue` is only a non-secret hint. The real value enters solely on approval via the
// createSecret path and is never returned.
builder.prismaObject("SecretProposal", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    scope: t.exposeString("scope"),
    requestedByAgentId: t.exposeString("requestedByAgentId", { nullable: true }),
    placeholderValue: t.exposeString("placeholderValue", { nullable: true }),
    status: t.exposeString("status"),
    decisionReason: t.exposeString("decisionReason", { nullable: true }),
    decidedByProfileId: t.exposeString("decidedByProfileId", { nullable: true }),
    createdSecretId: t.exposeString("createdSecretId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    decidedAt: t.expose("decidedAt", { type: "DateTime", nullable: true }),
  }),
});
