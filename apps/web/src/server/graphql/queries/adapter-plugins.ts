import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { listAdapterPlugins } from "@/server/services/adapter-plugins";
builder.queryField("adapterPlugins", (t) =>
  t.prismaField({ type: ["AdapterPlugin"], resolve: async (_q, _r, _a, ctx) => { const tn = requireRole(ctx, "member"); return listAdapterPlugins(tn.workspaceId); } }),
);
