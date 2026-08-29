import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { getAgentSkillSnapshot } from "@/server/services/agent-skills-sync";

builder.queryField("agentSkillSnapshot", (t) =>
  t.field({
    type: "JSON",
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return getAgentSkillSnapshot(tn.workspaceId, args.agentId) as unknown as Record<
        string,
        unknown
      >;
    },
  }),
);
