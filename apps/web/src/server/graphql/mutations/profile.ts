import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { findProfileForUpdate, updateProfile } from "@agentcenter/database";

builder.mutationField("updateMyProfile", (t) =>
  t.prismaField({
    type: "Profile",
    args: {
      displayName: t.arg.string(),
      bio: t.arg.string(),
      avatarUrl: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      if (!ctx.session?.profileId) {
        throw new GraphQLError("Authentication required");
      }

      const profile = await findProfileForUpdate(ctx.session.profileId);

      if (!profile) {
        throw new GraphQLError("Profile not found");
      }

      if (profile.kind !== "human") {
        throw new GraphQLError("Only human profiles can be updated this way");
      }

      const data: { displayName?: string; bio?: string | null; avatarUrl?: string | null } = {};

      if (args.displayName !== undefined && args.displayName !== null) {
        const trimmed = args.displayName.trim();
        if (trimmed.length === 0) {
          throw new GraphQLError("Display name cannot be empty");
        }
        data.displayName = trimmed;
      }

      if (args.bio !== undefined) {
        data.bio = args.bio?.trim() || null;
      }

      if (args.avatarUrl !== undefined) {
        data.avatarUrl = args.avatarUrl?.trim() || null;
      }

      return updateProfile(profile.id, data, query);
    },
  }),
);
