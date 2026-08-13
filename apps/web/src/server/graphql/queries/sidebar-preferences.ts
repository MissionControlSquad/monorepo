import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { getSidebarPreference } from "@/server/services/sidebar-preferences";

// Paperclip parity: a user's sidebar nav customization (order + hidden items). Own-user scoped.
const SidebarPreferenceType = builder.simpleObject("SidebarPreference", {
  fields: (t) => ({
    orderedIds: t.stringList(),
    hiddenIds: t.stringList(),
  }),
});

builder.queryField("sidebarPreference", (t) =>
  t.field({
    type: SidebarPreferenceType,
    resolve: async (_root, _args, ctx) => {
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return getSidebarPreference(tenancy.workspaceId, tenancy.userId);
    },
  }),
);

export { SidebarPreferenceType };
