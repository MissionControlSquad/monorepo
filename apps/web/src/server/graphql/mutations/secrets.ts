import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { GraphQLError } from "graphql";
import { isSecretStatus, parseDotEnv } from "@agentcenter/utils";
import {
  createSecret,
  rotateSecret,
  rotateManagedSecret,
  bindSecret,
  unbindSecret,
  updateSecret,
  setSecretStatus,
  createSecretProvider,
  deleteSecretProvider,
  checkSecretProviderHealth,
  importSecrets,
  isSecretProviderKind,
  isSecretBindingScope,
} from "@/server/services/secrets";

const ImportSecretsSummary = builder.simpleObject("ImportSecretsSummary", {
  fields: (t) => ({
    created: t.int(),
    skipped: t.int(),
    rotated: t.int(),
    invalidLines: t.int(),
  }),
});

// Epic #5: secrets vault mutations — SECRETS_VAULT-gated + admin only. The `value` arg is the ONLY
// place plaintext enters (over TLS); it is encrypted immediately and never returned.
builder.mutationField("createSecret", (t) =>
  t.prismaField({
    type: "Secret",
    args: {
      name: t.arg.string({ required: true }),
      value: t.arg.string({ required: true }),
      description: t.arg.string(),
      providerId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const secret = await createSecret({
        workspaceId: tenancy.workspaceId,
        createdBy: tenancy.userId,
        name: args.name,
        value: args.value,
        description: args.description ?? null,
        providerId: args.providerId ?? null,
      });
      return ctx.prisma.secret.findUniqueOrThrow({ ...query, where: { id: secret.id } });
    },
  }),
);

// A member's OWN personal secret (owner-only visibility + management). Members create these for
// themselves — workspace secrets remain admin-only via createSecret.
builder.mutationField("createUserSecret", (t) =>
  t.prismaField({
    type: "Secret",
    args: {
      name: t.arg.string({ required: true }),
      value: t.arg.string({ required: true }),
      description: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const secret = await createSecret({
        workspaceId: tenancy.workspaceId,
        createdBy: tenancy.userId,
        name: args.name,
        value: args.value,
        description: args.description ?? null,
        personal: true,
      });
      return ctx.prisma.secret.findUniqueOrThrow({ ...query, where: { id: secret.id } });
    },
  }),
);

builder.mutationField("rotateSecret", (t) =>
  t.prismaField({
    type: "Secret",
    args: { id: t.arg.string({ required: true }), value: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      // member+ then the service authorizes (owner for personal, admin for workspace).
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const secret = await rotateSecret({
        workspaceId: tenancy.workspaceId,
        secretId: args.id,
        value: args.value,
        createdBy: tenancy.userId,
        actor: { userId: tenancy.userId, role: tenancy.role },
      });
      return ctx.prisma.secret.findUniqueOrThrow({ ...query, where: { id: secret.id } });
    },
  }),
);

builder.mutationField("bindSecret", (t) =>
  t.prismaField({
    type: "SecretBinding",
    args: {
      secretId: t.arg.string({ required: true }),
      scope: t.arg.string({ required: true }),
      envVarName: t.arg.string({ required: true }),
      agentId: t.arg.string(),
      adapterType: t.arg.string(),
      toolConnectionId: t.arg.string(),
      pinnedVersion: t.arg.int(),
      // Richer bindings (parity §3 secrets depth) — additive, safe defaults in the service.
      configPath: t.arg.string(),
      versionSelector: t.arg.string(),
      projectionClass: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      if (!isSecretBindingScope(args.scope))
        throw new GraphQLError(`Invalid binding scope '${args.scope}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      const binding = await bindSecret({
        workspaceId: tenancy.workspaceId,
        createdBy: tenancy.userId,
        secretId: args.secretId,
        scope: args.scope,
        agentId: args.agentId ?? null,
        adapterType: args.adapterType ?? null,
        toolConnectionId: args.toolConnectionId ?? null,
        envVarName: args.envVarName,
        pinnedVersion: args.pinnedVersion ?? null,
        configPath: args.configPath ?? null,
        versionSelector: args.versionSelector ?? null,
        projectionClass: args.projectionClass ?? null,
        actor: { userId: tenancy.userId, role: tenancy.role },
      });
      return ctx.prisma.secretBinding.findUniqueOrThrow({ ...query, where: { id: binding.id } });
    },
  }),
);

// Provider WRITE-side managed rotation (parity §3 secrets depth): rotate a provider-backed secret by
// writing the new value to the external store (AWS/Vault), then record a new version + audit. Admin +
// SECRETS_VAULT. The provider client is injectable in the service so tests mock it (no live cloud call).
builder.mutationField("rotateManagedSecret", (t) =>
  t.prismaField({
    type: "Secret",
    args: {
      id: t.arg.string({ required: true }),
      value: t.arg.string({ required: true }),
      createRemote: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const secret = await rotateManagedSecret({
        workspaceId: tenancy.workspaceId,
        secretId: args.id,
        value: args.value,
        createdBy: tenancy.userId,
        createRemote: args.createRemote ?? false,
        actor: { userId: tenancy.userId, role: tenancy.role },
      });
      return ctx.prisma.secret.findUniqueOrThrow({ ...query, where: { id: secret.id } });
    },
  }),
);

builder.mutationField("unbindSecret", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return unbindSecret(tenancy.workspaceId, args.id, tenancy.userId, {
        userId: tenancy.userId,
        role: tenancy.role,
      });
    },
  }),
);

builder.mutationField("updateSecret", (t) =>
  t.prismaField({
    type: "Secret",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      description: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const secret = await updateSecret(
        tenancy.workspaceId,
        args.id,
        { name: args.name ?? null, description: args.description ?? undefined },
        { userId: tenancy.userId, role: tenancy.role },
      );
      return ctx.prisma.secret.findUniqueOrThrow({ ...query, where: { id: secret.id } });
    },
  }),
);

builder.mutationField("createSecretProvider", (t) =>
  t.prismaField({
    type: "SecretProviderConfig",
    args: {
      name: t.arg.string({ required: true }),
      kind: t.arg.string({ required: true }),
      config: t.arg({ type: "JSON" }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      if (!isSecretProviderKind(args.kind))
        throw new GraphQLError(`Invalid provider kind '${args.kind}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      const provider = await createSecretProvider({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        kind: args.kind,
        config: (args.config as Record<string, unknown> | null) ?? null,
      });
      return ctx.prisma.secretProviderConfig.findUniqueOrThrow({
        ...query,
        where: { id: provider.id },
      });
    },
  }),
);

builder.mutationField("deleteSecretProvider", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return deleteSecretProvider(tenancy.workspaceId, args.id);
    },
  }),
);

// Domain 7 P2: run a provider health check and persist healthy/lastCheckedAt/lastError.
builder.mutationField("checkSecretProviderHealth", (t) =>
  t.prismaField({
    type: "SecretProviderConfig",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const provider = await checkSecretProviderHealth(tenancy.workspaceId, args.id);
      return ctx.prisma.secretProviderConfig.findUniqueOrThrow({
        ...query,
        where: { id: provider.id },
      });
    },
  }),
);

builder.mutationField("importSecrets", (t) =>
  t.field({
    type: ImportSecretsSummary,
    args: { text: t.arg.string({ required: true }), overwrite: t.arg.boolean() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const parsed = parseDotEnv(args.text);
      const res = await importSecrets({
        workspaceId: tenancy.workspaceId,
        createdBy: tenancy.userId,
        entries: parsed.entries,
        overwrite: args.overwrite ?? false,
      });
      return { ...res, invalidLines: parsed.invalidLines.length };
    },
  }),
);

builder.mutationField("setSecretStatus", (t) =>
  t.prismaField({
    type: "Secret",
    args: { id: t.arg.string({ required: true }), status: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      if (!isSecretStatus(args.status))
        throw new GraphQLError(`Invalid status '${args.status}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      const secret = await setSecretStatus(tenancy.workspaceId, args.id, args.status, {
        userId: tenancy.userId,
        role: tenancy.role,
      });
      return ctx.prisma.secret.findUniqueOrThrow({ ...query, where: { id: secret.id } });
    },
  }),
);
