import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { GraphQLError } from "graphql";
import { isProposalStatus } from "@/server/services/secret-proposals";

// Human-approved secret proposals (Paperclip #9934 port). SECRET_PROPOSALS-gated, workspace-scoped,
// member+ reads. Values are never exposed here — only proposal metadata.
builder.queryField("secretProposals", (t) =>
  t.prismaField({
    type: ["SecretProposal"],
    args: { status: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRET_PROPOSALS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      if (args.status && !isProposalStatus(args.status))
        throw new GraphQLError(`Invalid status '${args.status}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      return ctx.prisma.secretProposal.findMany({
        ...query,
        where: scoped(ctx, args.status ? { status: args.status } : {}),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
