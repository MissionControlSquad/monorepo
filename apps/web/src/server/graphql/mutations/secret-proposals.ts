import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { GraphQLError } from "graphql";
import {
  createProposal,
  approveProposal,
  denyProposal,
  isProposalScope,
} from "@/server/services/secret-proposals";

// Human-approved secret proposals (Paperclip #9934 port). SECRET_PROPOSALS-gated + workspace-scoped.
// Any member may FILE a proposal (agents/system route through here on a member's behalf); only an
// admin may APPROVE (which materializes the real vault secret) or DENY.

builder.mutationField("createSecretProposal", (t) =>
  t.prismaField({
    type: "SecretProposal",
    args: {
      name: t.arg.string({ required: true }),
      description: t.arg.string(),
      scope: t.arg.string(),
      requestedByAgentId: t.arg.string(),
      placeholderValue: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRET_PROPOSALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      if (args.scope && !isProposalScope(args.scope))
        throw new GraphQLError(`Invalid scope '${args.scope}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      const proposal = await createProposal({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        description: args.description ?? null,
        scope: (args.scope as "workspace" | "agent" | null) ?? null,
        requestedByAgentId: args.requestedByAgentId ?? null,
        placeholderValue: args.placeholderValue ?? null,
      });
      return ctx.prisma.secretProposal.findUniqueOrThrow({
        ...query,
        where: { id: proposal.id },
      });
    },
  }),
);

// Approve: admin supplies the real secret value; the existing createSecret path materializes it. The
// value is write-only (encrypted immediately, never returned). Returns the updated proposal.
builder.mutationField("approveSecretProposal", (t) =>
  t.prismaField({
    type: "SecretProposal",
    args: {
      id: t.arg.string({ required: true }),
      value: t.arg.string({ required: true }),
      name: t.arg.string(),
      description: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRET_PROPOSALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const { proposal } = await approveProposal({
        workspaceId: tenancy.workspaceId,
        proposalId: args.id,
        value: args.value,
        name: args.name ?? null,
        description: args.description ?? null,
        decidedByProfileId: tenancy.userId,
      });
      return ctx.prisma.secretProposal.findUniqueOrThrow({
        ...query,
        where: { id: proposal.id },
      });
    },
  }),
);

builder.mutationField("denySecretProposal", (t) =>
  t.prismaField({
    type: "SecretProposal",
    args: { id: t.arg.string({ required: true }), reason: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRET_PROPOSALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const proposal = await denyProposal({
        workspaceId: tenancy.workspaceId,
        proposalId: args.id,
        reason: args.reason,
        decidedByProfileId: tenancy.userId,
      });
      return ctx.prisma.secretProposal.findUniqueOrThrow({
        ...query,
        where: { id: proposal.id },
      });
    },
  }),
);
