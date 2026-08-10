import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { listAdapterPlugins } from "@/server/services/adapter-plugins";
builder.queryField("adapterPlugins", (t) =>
  t.prismaField({
    type: ["AdapterPlugin"],
    resolve: async (_q, _r, _a, ctx) => {
      await requireFeature(FLAG_KEYS.ADAPTER_PLUGINS);
      const tn = requireRole(ctx, "member");
      return listAdapterPlugins(tn.workspaceId);
    },
  }),
);
