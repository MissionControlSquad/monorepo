import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { listSmokeCases } from "@/server/services/smoke-lab";
builder.queryField("smokeCases", (t) =>
  t.prismaField({ type: ["SmokeCase"], resolve: async (_q, _r, _a, ctx) => { await requireFeature(FLAG_KEYS.SMOKE_LAB); const tn = requireRole(ctx, "member"); return listSmokeCases(tn.workspaceId); } }),
);
