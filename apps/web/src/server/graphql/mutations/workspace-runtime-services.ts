import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { verifyRunBridgeToken } from "@/server/services/run-bridge";
import {
  startWorkspaceRuntimeService,
  stopWorkspaceRuntimeService,
  setRuntimeServiceHealth,
  type StopReason,
} from "@/server/services/workspace-runtime-services";

// WorkspaceRuntimeService writes. LOCAL_SERVICES-gated. start/stop are admin (arbitrary long-lived
// process control); setHealth is a runner/bridge callback and also accepts an admin (for testing).

// Start (or reuse) a long-lived runtime service (e.g. `npm run dev`) in an execution workspace. Reuse
// by reuseKey means a second start with the same key returns the SAME service instead of duplicating.
builder.mutationField("startWorkspaceRuntimeService", (t) =>
  t.prismaField({
    type: "WorkspaceRuntimeService",
    args: {
      executionWorkspaceId: t.arg.string({ required: true }),
      name: t.arg.string({ required: true }),
      command: t.arg.string({ required: true }),
      reuseKey: t.arg.string({ required: true }),
      port: t.arg.int(),
      healthCheckUrl: t.arg.string(),
      // on_idle | on_run_end | manual
      stopPolicy: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LOCAL_SERVICES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const { service } = await startWorkspaceRuntimeService(tenancy.workspaceId, {
        executionWorkspaceId: args.executionWorkspaceId,
        name: args.name,
        command: args.command,
        reuseKey: args.reuseKey,
        port: args.port ?? null,
        healthCheckUrl: args.healthCheckUrl ?? null,
        stopPolicy: args.stopPolicy ?? null,
      });
      return ctx.prisma.workspaceRuntimeService.findUniqueOrThrow({
        ...query,
        where: { id: service.id },
      });
    },
  }),
);

// Stop a runtime service. An operator `manual` stop always wins; other reasons respect stopPolicy.
builder.mutationField("stopWorkspaceRuntimeService", (t) =>
  t.prismaField({
    type: "WorkspaceRuntimeService",
    args: {
      id: t.arg.string({ required: true }),
      // manual | run_end | idle (default manual — an explicit operator stop).
      reason: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LOCAL_SERVICES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const reason = (args.reason ?? "manual") as StopReason;
      await stopWorkspaceRuntimeService(tenancy.workspaceId, args.id, { reason });
      return ctx.prisma.workspaceRuntimeService.findUniqueOrThrow({
        ...query,
        where: { id: args.id },
      });
    },
  }),
);

// Report a health-probe result for a runtime service. This is the runner→control-plane callback: a
// runner inside the sandbox passes its run-scoped bridge token (rbt_…) to authorize, and the service's
// workspace is derived from that token (never client input). An admin session may also call it (used to
// mark health from the dashboard / in tests). LOCAL_SERVICES-gated in both paths.
builder.mutationField("setWorkspaceRuntimeServiceHealth", (t) =>
  t.prismaField({
    type: "WorkspaceRuntimeService",
    args: {
      id: t.arg.string({ required: true }),
      // "healthy" | "unhealthy"
      health: t.arg.string({ required: true }),
      // A run-scoped bridge token (rbt_…) when the caller is a runner rather than a human admin.
      runToken: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LOCAL_SERVICES);
      if (args.health !== "healthy" && args.health !== "unhealthy") {
        throw new GraphQLError("health must be 'healthy' or 'unhealthy'", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      // Resolve the workspace either from a run-bridge token (runner) or an admin session (human).
      let workspaceId: string;
      if (args.runToken) {
        const run = await verifyRunBridgeToken(args.runToken);
        if (!run) {
          throw new GraphQLError("Invalid or expired run token", {
            extensions: { code: "UNAUTHORIZED" },
          });
        }
        workspaceId = run.workspaceId;
      } else {
        workspaceId = requireRole(ctx, WORKSPACE_ROLES.ADMIN).workspaceId;
      }

      await setRuntimeServiceHealth(workspaceId, args.id, args.health);
      return ctx.prisma.workspaceRuntimeService.findUniqueOrThrow({
        ...query,
        where: { id: args.id },
      });
    },
  }),
);
