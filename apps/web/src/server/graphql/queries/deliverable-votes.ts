import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { voteSummary } from "@/server/services/deliverable-votes";

// Tier C: deliverable vote summary. VOTING-gated, member+.
export const VoteSummaryType = builder.simpleObject("VoteSummary", {
  fields: (t) => ({
    score: t.int(),
    upCount: t.int(),
    downCount: t.int(),
    myVote: t.int(),
  }),
});

builder.queryField("deliverableVotes", (t) =>
  t.field({
    type: VoteSummaryType,
    args: { deliverableId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.VOTING);
      const tenancy = requireRole(ctx, "member");
      return voteSummary(args.deliverableId, tenancy.userId);
    },
  }),
);
