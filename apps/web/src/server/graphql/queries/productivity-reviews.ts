import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { flaggedAgents } from "@/server/services/productivity-reviews";
const ProductivityReview = builder.simpleObject("ProductivityReview", {
  fields: (t) => ({ id: t.string(), agentId: t.string(), verdict: t.string(), score: t.float(), reasons: t.stringList() }),
});
builder.queryField("flaggedAgents", (t) =>
  t.field({ type: [ProductivityReview], resolve: async (_r, _a, ctx) => { await requireFeature(FLAG_KEYS.PRODUCTIVITY_REVIEW); const tn = requireRole(ctx, "member");
    return (await flaggedAgents(tn.workspaceId)).map((r) => ({ id: r.id, agentId: r.agentId, verdict: r.verdict, score: r.score, reasons: r.reasons })); } }),
);
