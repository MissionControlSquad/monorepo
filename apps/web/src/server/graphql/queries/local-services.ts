import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listLocalServices } from "@/server/services/local-services";
builder.queryField("localServices", (t) =>
  t.prismaField({
    type: ["LocalService"],
    args: { status: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listLocalServices(tn.workspaceId, args.status ?? undefined);
    },
  }),
);
