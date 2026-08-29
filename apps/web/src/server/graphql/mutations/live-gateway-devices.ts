import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { approveDevice, revokeDevice } from "@/server/services/live-gateway-devices";
import { createKeyClaim, claimAgentKey, revokeKeyClaim } from "@/server/services/agent-key-claims";

// Parity Domain-10 A5/A6 + A13 (GAP-1 / GAP-5). Device approval + agent-key claim provisioning are
// privileged: LIVE_GATEWAY-gated, admin-only, workspace-scoped. A pending device cannot connect to
// the Live Gateway until approved here.

// ─── Device pairing ─────────────────────────────────────────────────────────────

builder.mutationField("approveLiveGatewayDevice", (t) =>
  t.prismaField({
    type: "LiveGatewayDevice",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LIVE_GATEWAY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      await approveDevice(tenancy.workspaceId, args.id, tenancy.userId);
      return ctx.prisma.liveGatewayDevice.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

builder.mutationField("revokeLiveGatewayDevice", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LIVE_GATEWAY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return revokeDevice(tenancy.workspaceId, args.id);
    },
  }),
);

// ─── Agent-key claim ceremony ─────────────────────────────────────────────────

// The mint result carries the one-time claimSecret - the ONLY time it is ever returned.
const MintedAgentKeyClaim = builder.simpleObject("MintedAgentKeyClaim", {
  fields: (t) => ({
    id: t.string(),
    label: t.string({ nullable: true }),
    claimSecret: t.string(),
    expiresAt: t.field({ type: "DateTime" }),
  }),
});

// The redeem result carries the plaintext agent key - the ONLY time it is ever returned.
const ClaimedAgentKey = builder.simpleObject("ClaimedAgentKey", {
  fields: (t) => ({
    agentKey: t.string(),
    agentId: t.string({ nullable: true }),
  }),
});

builder.mutationField("createAgentKeyClaim", (t) =>
  t.field({
    type: MintedAgentKeyClaim,
    args: {
      agentId: t.arg.string(),
      label: t.arg.string(),
      ttlMs: t.arg.int(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LIVE_GATEWAY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const { claim, claimSecret } = await createKeyClaim({
        workspaceId: tenancy.workspaceId,
        agentId: args.agentId ?? null,
        label: args.label ?? null,
        ttlMs: args.ttlMs ?? undefined,
        createdByProfileId: tenancy.userId,
      });
      return { id: claim.id, label: claim.label, claimSecret, expiresAt: claim.expiresAt };
    },
  }),
);

builder.mutationField("claimAgentKey", (t) =>
  t.field({
    type: ClaimedAgentKey,
    args: {
      claimId: t.arg.string({ required: true }),
      secret: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LIVE_GATEWAY);
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return claimAgentKey(args.claimId, args.secret);
    },
  }),
);

builder.mutationField("revokeAgentKeyClaim", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LIVE_GATEWAY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return revokeKeyClaim(tenancy.workspaceId, args.id);
    },
  }),
);
