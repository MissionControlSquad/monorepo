import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { GraphQLError } from "graphql";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { EnvironmentType } from "../queries/environments";
import {
  createEnvironment,
  updateEnvironment,
  archiveEnvironment,
  removeEnvironmentIfDeletable,
  ENVIRONMENT_DRIVERS,
  type EnvironmentDriver,
} from "@/server/services/environments";

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
