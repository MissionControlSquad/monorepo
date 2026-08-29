import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

// Parity Domain-10 A5/A6 + A13 (GAP-1 / GAP-5): read surfaces for Live Gateway device pairing and
// agent-key claims. LIVE_GATEWAY-gated, admin-only (device approval + key provisioning are
// privileged), workspace-scoped. No secret/hash fields are selectable (see the prismaObjects).

builder.queryField("liveGatewayDevices", (t) =>
  t.prismaField({
    type: ["LiveGatewayDevice"],
    args: { status: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LIVE_GATEWAY);
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return ctx.prisma.liveGatewayDevice.findMany({
        ...query,
        where: scoped(ctx, args.status ? { status: args.status } : {}),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("agentKeyClaims", (t) =>
  t.prismaField({
    type: ["AgentKeyClaim"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.LIVE_GATEWAY);
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return ctx.prisma.agentKeyClaim.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
