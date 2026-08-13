import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listSmokeCases } from "@/server/services/smoke-lab";
builder.queryField("smokeCases", (t) =>
  t.prismaField({
    type: ["SmokeCase"],
    resolve: async (_q, _r, _a, ctx) => {
      await requireFeature(FLAG_KEYS.SMOKE_LAB);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listSmokeCases(tn.workspaceId);
    },
  }),
);
