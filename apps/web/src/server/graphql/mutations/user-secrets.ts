import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  createUserSecretDefinition,
  deleteUserSecretDefinition,
  declareUserSecret,
} from "@/server/services/user-secrets";

// Parity §3 #7. Admins define what members must provide; members provide their own values. The
// `value` arg is the ONLY place plaintext enters (over TLS) — it's encrypted immediately via the
// vault's createSecret/rotateSecret path and never returned.

// Admin: declare that this workspace expects each member to provide a credential.
builder.mutationField("createUserSecretDefinition", (t) =>
  t.prismaField({
    type: "UserSecretDefinition",
    args: {
      key: t.arg.string({ required: true }),
      displayName: t.arg.string({ required: true }),
      description: t.arg.string(),
      required: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, "admin");
      const def = await createUserSecretDefinition({
        workspaceId: tenancy.workspaceId,
        key: args.key,
        displayName: args.displayName,
        description: args.description ?? null,
        required: args.required ?? true,
        createdByProfileId: tenancy.userId,
      });
      return ctx.prisma.userSecretDefinition.findUniqueOrThrow({
        ...query,
        where: { id: def.id },
      });
    },
  }),
);

// Admin: remove a definition (cascades its declarations).
builder.mutationField("deleteUserSecretDefinition", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, "admin");
      return deleteUserSecretDefinition(tenancy.workspaceId, args.id);
    },
  }),
);

// Self: the current member provides (or rotates) their value for a definition. member+; the value is
// stored only as ciphertext in a personal Secret owned by the caller.
builder.mutationField("declareUserSecret", (t) =>
  t.prismaField({
    type: "UserSecretDeclaration",
    args: {
      definitionId: t.arg.string({ required: true }),
      value: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, "member");
      const decl = await declareUserSecret({
        workspaceId: tenancy.workspaceId,
        definitionId: args.definitionId,
        profileId: tenancy.userId,
        value: args.value,
      });
      return ctx.prisma.userSecretDeclaration.findUniqueOrThrow({
        ...query,
        where: { id: decl.id },
      });
    },
  }),
);
