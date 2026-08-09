import { builder } from "../builder";

// Parity Domain-10 A5/A6 / GAP-1: paired Live Gateway device. The Ed25519 publicKeyRaw is a public
// value (safe to expose); no secret/hash fields exist on this model. LIVE_GATEWAY-gated, workspace-scoped.
builder.prismaObject("LiveGatewayDevice", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    machineFingerprint: t.exposeString("machineFingerprint"),
    publicKeyRaw: t.exposeString("publicKeyRaw"),
    label: t.exposeString("label", { nullable: true }),
    status: t.exposeString("status"),
    approvedByProfileId: t.exposeString("approvedByProfileId", { nullable: true }),
    approvedAt: t.expose("approvedAt", { type: "DateTime", nullable: true }),
    lastSeenAt: t.expose("lastSeenAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
