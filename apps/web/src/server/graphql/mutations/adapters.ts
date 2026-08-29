import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { isFeatureEnabled } from "@/server/feature-flags";
import { getAdapter, validateAdapterConfig } from "@/server/adapters/registry";

// Epic #2: assign an adapter (+ validated config) to an agent. Admin-only, workspace-scoped.
// A non-builtIn adapter requires the multi_provider_adapters feature; openclaw-gateway always works.
builder.mutationField("setAgentAdapter", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      agentId: t.arg.string({ required: true }),
      adapterType: t.arg.string({ required: true }),
      adapterConfig: t.arg({ type: "JSON" }),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);

      // Agent must belong to the caller's workspace.
      const agent = await ctx.prisma.agent.findFirst({ where: scoped(ctx, { id: args.agentId }) });
      if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });

      const adapter = await getAdapter(args.adapterType);
      if (!adapter || !adapter.enabled)
        throw new GraphQLError(`Unknown or disabled adapter '${args.adapterType}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });

      // Non-builtIn adapters are gated by the feature.
      if (!adapter.builtIn) {
        const featureEnabled = await isFeatureEnabled(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS);
        if (!featureEnabled)
          throw new GraphQLError("Multi-provider adapters are not enabled on your plan", {
            extensions: { code: "FEATURE_DISABLED", feature: FLAG_KEYS.MULTI_PROVIDER_ADAPTERS },
          });
      }

      const config = args.adapterConfig ?? {};
      const result = validateAdapterConfig(adapter.configSchema, config);
      if (!result.valid)
        throw new GraphQLError(`adapterConfig invalid: ${result.errors.join("; ")}`, {
          extensions: { code: "BAD_USER_INPUT", errors: result.errors },
        });

      await ctx.prisma.agent.update({
        where: { id: agent.id },
        data: { adapterType: adapter.type, adapterConfig: config },
      });
      return ctx.prisma.agent.findUniqueOrThrow({ ...query, where: { id: agent.id } });
    },
  }),
);

// Epic #2 (Adapter Manager): enable/disable an installed adapter, instance-admin action. Global
// capability config (no workspaceId). The builtIn openclaw-gateway can never be disabled — existing
// agents must always be able to resolve it — so disabling it is rejected.
builder.mutationField("setAdapterEnabled", (t) =>
  t.prismaField({
    type: "AgentAdapter",
    args: {
      adapterType: t.arg.string({ required: true }),
      enabled: t.arg.boolean({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);

      const adapter = await getAdapter(args.adapterType);
      if (!adapter)
        throw new GraphQLError(`Unknown adapter '${args.adapterType}'`, {
          extensions: { code: "NOT_FOUND" },
        });

      if (adapter.builtIn && !args.enabled)
        throw new GraphQLError("The built-in adapter cannot be disabled", {
          extensions: { code: "BAD_USER_INPUT" },
        });

      return ctx.prisma.agentAdapter.update({
        ...query,
        where: { type: adapter.type },
        data: { enabled: args.enabled },
      });
    },
  }),
);

// Epic #2 (Adapter Manager): register an EXTERNAL adapter as a registry record so it becomes
// selectable/manageable. This is the record-level install (like a manifest install) — admin-only,
// gated by multi_provider_adapters. It does NOT hot-load npm/local module code (the runtime hot-load
// — reload/reinstall — is separate, deferred infra). New adapters start disabled (opt-in).
const TRANSPORTS = new Set(["local", "gateway", "cloud"]);
const AUTH_KINDS = new Set(["none", "apiKey", "subscription", "secretBinding"]);

builder.mutationField("installAdapter", (t) =>
  t.prismaField({
    type: "AgentAdapter",
    args: {
      type: t.arg.string({ required: true }),
      displayName: t.arg.string({ required: true }),
      transport: t.arg.string(),
      authKind: t.arg.string(),
      configSchema: t.arg({ type: "JSON" }),
      version: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const featureEnabled = await isFeatureEnabled(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS);
      if (!featureEnabled)
        throw new GraphQLError("Multi-provider adapters are not enabled on your plan", {
          extensions: { code: "FEATURE_DISABLED", feature: FLAG_KEYS.MULTI_PROVIDER_ADAPTERS },
        });

      const type = args.type.trim();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(type))
        throw new GraphQLError("Adapter type must be a lowercase kebab-case key", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      if (await getAdapter(type))
        throw new GraphQLError(`An adapter '${type}' already exists`, {
          extensions: { code: "BAD_USER_INPUT" },
        });

      const transport = args.transport ?? "local";
      const authKind = args.authKind ?? "apiKey";
      if (!TRANSPORTS.has(transport) || !AUTH_KINDS.has(authKind))
        throw new GraphQLError("Invalid transport or authKind", {
          extensions: { code: "BAD_USER_INPUT" },
        });

      return ctx.prisma.agentAdapter.create({
        ...query,
        data: {
          type,
          displayName: args.displayName.trim(),
          transport: transport as never,
          authKind: authKind as never,
          configSchema: (args.configSchema ?? {}) as never,
          version: args.version ?? "1.0.0",
          builtIn: false,
          enabled: false,
        },
      });
    },
  }),
);

// Remove an external adapter record. The builtIn openclaw-gateway can never be removed.
builder.mutationField("removeAdapter", (t) =>
  t.field({
    type: "Boolean",
    args: { adapterType: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const adapter = await getAdapter(args.adapterType);
      if (!adapter)
        throw new GraphQLError(`Unknown adapter '${args.adapterType}'`, {
          extensions: { code: "NOT_FOUND" },
        });
      if (adapter.builtIn)
        throw new GraphQLError("The built-in adapter cannot be removed", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      await ctx.prisma.agentAdapter.delete({ where: { type: adapter.type } });
      return true;
    },
  }),
);
