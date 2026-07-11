import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { createSecret, rotateSecret, bindSecret, unbindSecret } from "@/server/services/secrets";

// Epic #5: secrets vault mutations — SECRETS_VAULT-gated + admin only. The `value` arg is the ONLY
// place plaintext enters (over TLS); it is encrypted immediately and never returned.
builder.mutationField("createSecret", (t) =>
  t.prismaField({
    type: "Secret",
    args: {
      name: t.arg.string({ required: true }),
      value: t.arg.string({ required: true }),
      description: t.arg.string(),
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
