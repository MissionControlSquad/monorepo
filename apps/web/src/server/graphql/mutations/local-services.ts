import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { registerLocalService } from "@/server/services/local-services";

builder.mutationField("registerLocalService", (t) =>
  t.prismaField({
    type: "LocalService",
    args: { key: t.arg.string({ required: true }), kind: t.arg.string(), command: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      const tn = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return registerLocalService({
        workspaceId: tn.workspaceId,
        key: args.key,
        kind: args.kind ?? undefined,
        command: args.command ?? null,
      });
    },
  }),
);
