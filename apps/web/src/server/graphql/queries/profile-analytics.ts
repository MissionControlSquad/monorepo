import { builder } from "../builder";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { getProfileAnalytics } from "@/server/services/profile-analytics";

// Per-member analytics (Epic: Multiple Human Users — member productivity/cost). Member-visible,
// workspace-scoped. App-data aggregation only (no human identity — that is buildbase).

const CostByModel = builder.simpleObject("ProfileCostByModel", {
  fields: (t) => ({
    model: t.string(),
    tokensIn: t.int(),
    tokensOut: t.int(),
    spendCents: t.int(),
  }),
});

const ProfileCostSummary = builder.simpleObject("ProfileCostSummary", {
  fields: (t) => ({
    totalTokensIn: t.int(),
    totalTokensOut: t.int(),
    totalSpendCents: t.int(),
    byModel: t.field({ type: [CostByModel] }),
  }),
});

const ProfileAnalytics = builder.simpleObject("ProfileAnalytics", {
  fields: (t) => ({
    profileId: t.string(),
    displayName: t.string(),
    kind: t.string(),
    agentId: t.string({ nullable: true }),
    tasksAssigned: t.int(),
    tasksCompleted: t.int(),
    completionRate: t.float(),
    tasksCreated: t.int(),
    activityCount: t.int(),
    cost: t.field({ type: ProfileCostSummary }),
  }),
});

builder.queryField("profileAnalytics", (t) =>
  t.field({
    type: ProfileAnalytics,
    nullable: true,
    args: { profileId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      // Ensure the requested profile belongs to an agent in this workspace, or is the caller — a
      // member can't probe arbitrary cross-workspace profiles. Agent profiles are workspace-scoped
      // via the agent; a profile with no agent (human) is only self-viewable here.
      const profile = await ctx.prisma.profile.findUnique({
        where: { id: args.profileId },
        select: { agentId: true },
      });
      if (!profile) return null;
      if (profile.agentId) {
        const agent = await ctx.prisma.agent.findFirst({
          where: scoped(ctx, { id: profile.agentId }),
          select: { id: true },
        });
        if (!agent) return null; // agent not in this workspace
      } else if (args.profileId !== tenancy.userId) {
        return null; // human profile — self only
      }
      return getProfileAnalytics(tenancy.workspaceId, args.profileId);
    },
  }),
);
