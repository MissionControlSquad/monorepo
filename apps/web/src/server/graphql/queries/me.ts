import { builder } from "../builder";

/** Current logged-in user's profile (from session). Null when not logged in or no profile. */
builder.queryField("me", (t) =>
  t.prismaField({
    type: "Profile",
    nullable: true,
    resolve: async (query, _root, _args, ctx) => {
      if (!ctx.session?.profileId) return null;
      return ctx.prisma.profile.findUnique({
        ...query,
        where: { id: ctx.session.profileId },
      });
    },
  }),
);
