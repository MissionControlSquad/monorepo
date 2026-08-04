import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { listLocalServices } from "@/server/services/local-services";
builder.queryField("localServices", (t) =>
  t.prismaField({ type: ["LocalService"], args: { status: t.arg.string() }, resolve: async (_q, _r, args, ctx) => { const tn = requireRole(ctx, "member"); return listLocalServices(tn.workspaceId, args.status ?? undefined); } }),
);
