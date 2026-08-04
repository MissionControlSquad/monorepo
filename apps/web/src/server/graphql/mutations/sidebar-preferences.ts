import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { setSidebarPreference } from "@/server/services/sidebar-preferences";
import { SidebarPreferenceType } from "../queries/sidebar-preferences";

// Paperclip parity: save a user's sidebar nav order + hidden items. Own-user scoped.
builder.mutationField("setSidebarPreference", (t) =>
  t.field({
    type: SidebarPreferenceType,
    args: {
      orderedIds: t.arg.stringList({ required: true }),
      hiddenIds: t.arg.stringList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const tenancy = requireRole(ctx, "member");
      return setSidebarPreference(
        tenancy.workspaceId,
        tenancy.userId,
        args.orderedIds,
        args.hiddenIds,
      );
    },
  }),
);
