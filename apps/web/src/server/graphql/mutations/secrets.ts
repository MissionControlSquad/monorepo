import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { GraphQLError } from "graphql";
import { isSecretStatus, parseDotEnv } from "@agentcenter/utils";
import {
  createSecret,
  rotateSecret,
  bindSecret,
  unbindSecret,
  updateSecret,
  setSecretStatus,
  createSecretProvider,
  deleteSecretProvider,
  importSecrets,
  isSecretProviderKind,
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
      const tenancy = requireRole(ctx, "admin");
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

builder.mutationField("rotateSecret", (t) =>
  t.prismaField({
    type: "Secret",
    args: { id: t.arg.string({ required: true }), value: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, "admin");
      const secret = await rotateSecret({
        workspaceId: tenancy.workspaceId,
        secretId: args.id,
        value: args.value,
        createdBy: tenancy.userId,
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
      pinnedVersion: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, "admin");
      const binding = await bindSecret({
        workspaceId: tenancy.workspaceId,
        createdBy: tenancy.userId,
        secretId: args.secretId,
        scope: args.scope === "adapter" ? "adapter" : "agent",
        agentId: args.agentId ?? null,
        adapterType: args.adapterType ?? null,
        envVarName: args.envVarName,
        pinnedVersion: args.pinnedVersion ?? null,
      });
      return ctx.prisma.secretBinding.findUniqueOrThrow({ ...query, where: { id: binding.id } });
    },
  }),
);

builder.mutationField("unbindSecret", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, "admin");
      return unbindSecret(tenancy.workspaceId, args.id, tenancy.userId);
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
      const tenancy = requireRole(ctx, "admin");
      const secret = await updateSecret(tenancy.workspaceId, args.id, {
        name: args.name ?? null,
        description: args.description ?? undefined,
      });
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
      const tenancy = requireRole(ctx, "admin");
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
      const tenancy = requireRole(ctx, "admin");
      return deleteSecretProvider(tenancy.workspaceId, args.id);
    },
  }),
);

builder.mutationField("importSecrets", (t) =>
  t.field({
    type: ImportSecretsSummary,
    args: { text: t.arg.string({ required: true }), overwrite: t.arg.boolean() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, "admin");
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
      const tenancy = requireRole(ctx, "admin");
      if (!isSecretStatus(args.status))
        throw new GraphQLError(`Invalid status '${args.status}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      const secret = await setSecretStatus(tenancy.workspaceId, args.id, args.status);
      return ctx.prisma.secret.findUniqueOrThrow({ ...query, where: { id: secret.id } });
    },
  }),
);
