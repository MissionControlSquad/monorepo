import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { GraphQLError } from "graphql";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  EnvironmentType,
  EnvironmentProbeResultType,
  WorkspaceExecutionPolicyType,
} from "../queries/environments";
import {
  createEnvironment,
  updateEnvironment,
  archiveEnvironment,
  removeEnvironmentIfDeletable,
  probeEnvironment,
  ENVIRONMENT_DRIVERS,
  type EnvironmentDriver,
} from "@/server/services/environments";
import { setWorkspaceExecutionMode, type ExecutionMode } from "@/server/services/execution-policy";
import { destroyLeaseNow } from "@/server/services/environment-leases";
import {
  captureCustomImage,
  rollbackToTemplate,
  disableTemplate,
} from "@/server/services/environment-custom-images";

// Tier D / Phase 3: Environment writes. ENVIRONMENTS-gated, admin (drivers wire up credential use +
// arbitrary execution targets). Config secrets are persisted as {secretRef} pointers by the service;
// plaintext values in `config` are only ever a convenience for non-secret fields.

function coerceDriver(driver: string): EnvironmentDriver {
  if (!(ENVIRONMENT_DRIVERS as readonly string[]).includes(driver)) {
    throw new GraphQLError(`Unknown driver: ${driver}`, { extensions: { code: "BAD_USER_INPUT" } });
  }
  return driver as EnvironmentDriver;
}

builder.mutationField("createEnvironment", (t) =>
  t.field({
    type: EnvironmentType,
    args: {
      name: t.arg.string({ required: true }),
      driver: t.arg.string({ required: true }),
      description: t.arg.string(),
      config: t.arg({ type: "JSON" }),
      envVars: t.arg({ type: "JSON" }),
      metadata: t.arg({ type: "JSON" }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, "admin");
      return createEnvironment(
        tenancy.workspaceId,
        {
          name: args.name,
          driver: coerceDriver(args.driver),
          description: args.description ?? null,
          config: args.config ?? {},
          envVars: (args.envVars as Record<string, string>) ?? {},
          metadata: (args.metadata as Record<string, unknown>) ?? null,
        },
        tenancy.userId,
      );
    },
  }),
);

builder.mutationField("updateEnvironment", (t) =>
  t.field({
    type: EnvironmentType,
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      driver: t.arg.string(),
      description: t.arg.string(),
      config: t.arg({ type: "JSON" }),
      envVars: t.arg({ type: "JSON" }),
      metadata: t.arg({ type: "JSON" }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, "admin");
      return updateEnvironment(tenancy.workspaceId, args.id, {
        ...(args.name != null ? { name: args.name } : {}),
        ...(args.driver != null ? { driver: coerceDriver(args.driver) } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.config !== undefined ? { config: args.config } : {}),
        ...(args.envVars !== undefined ? { envVars: args.envVars as Record<string, string> } : {}),
        ...(args.metadata !== undefined
          ? { metadata: args.metadata as Record<string, unknown> }
          : {}),
      });
    },
  }),
);

builder.mutationField("archiveEnvironment", (t) =>
  t.field({
    type: EnvironmentType,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, "admin");
      return archiveEnvironment(tenancy.workspaceId, args.id);
    },
  }),
);

builder.mutationField("deleteEnvironment", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, "admin");
      return removeEnvironmentIfDeletable(tenancy.workspaceId, args.id);
    },
  }),
);

// Probe an environment's connectivity (may provision a throwaway sandbox). Admin (provisions + creds).
builder.mutationField("probeEnvironment", (t) =>
  t.field({
    type: EnvironmentProbeResultType,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, "admin");
      return probeEnvironment(tenancy.workspaceId, args.id);
    },
  }),
);

// Bind an agent to an Environment (or clear it → fall back to its ad-hoc sandboxProvider). Admin.
builder.mutationField("setAgentEnvironment", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      agentId: t.arg.string({ required: true }),
      environmentId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, "admin");
      const agent = await ctx.prisma.agent.findFirst({
        where: { id: args.agentId, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });
      if (args.environmentId) {
        const env = await ctx.prisma.environment.findFirst({
          where: { id: args.environmentId, workspaceId: tenancy.workspaceId },
          select: { id: true },
        });
        if (!env) {
          throw new GraphQLError("Environment not found", { extensions: { code: "NOT_FOUND" } });
        }
      }
      return ctx.prisma.agent.update({
        ...query,
        where: { id: agent.id },
        data: { environmentId: args.environmentId ?? null },
      });
    },
  }),
);

// Destroy a lease's machine now (manual teardown of a reused/retained sandbox). ENVIRONMENTS, admin.
builder.mutationField("destroyEnvironmentLease", (t) =>
  t.field({
    type: "Boolean",
    args: { leaseId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, "admin");
      return destroyLeaseNow(tenancy.workspaceId, args.leaseId);
    },
  }),
);

// Custom images (Plan 5): capture the env's box into a reusable image; rollback/disable. CUSTOM_IMAGES, admin.
builder.mutationField("captureCustomImage", (t) =>
  t.field({
    type: "String", // the new template id
    args: { environmentId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CUSTOM_IMAGES);
      const tenancy = requireRole(ctx, "admin");
      const created = await captureCustomImage(
        tenancy.workspaceId,
        args.environmentId,
        tenancy.userId,
      );
      return created.id;
    },
  }),
);

builder.mutationField("rollbackCustomImage", (t) =>
  t.field({
    type: "String",
    args: { templateId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CUSTOM_IMAGES);
      const tenancy = requireRole(ctx, "admin");
      const t2 = await rollbackToTemplate(tenancy.workspaceId, args.templateId);
      return t2.id;
    },
  }),
);

builder.mutationField("disableCustomImage", (t) =>
  t.field({
    type: "Boolean",
    args: { templateId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CUSTOM_IMAGES);
      const tenancy = requireRole(ctx, "admin");
      return disableTemplate(tenancy.workspaceId, args.templateId);
    },
  }),
);

// Set the workspace execution policy (force runs onto isolated k8s, or `any`). EXECUTION_POLICY, admin.
builder.mutationField("setWorkspaceExecutionMode", (t) =>
  t.field({
    type: WorkspaceExecutionPolicyType,
    args: {
      executionMode: t.arg.string(),
      enableIsolatedWorkspaces: t.arg.boolean(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXECUTION_POLICY);
      const tenancy = requireRole(ctx, "admin");
      return setWorkspaceExecutionMode(
        tenancy.workspaceId,
        {
          ...(args.executionMode != null
            ? { executionMode: args.executionMode as ExecutionMode }
            : {}),
          ...(args.enableIsolatedWorkspaces != null
            ? { enableIsolatedWorkspaces: args.enableIsolatedWorkspaces }
            : {}),
        },
        tenancy.userId,
      );
    },
  }),
);
