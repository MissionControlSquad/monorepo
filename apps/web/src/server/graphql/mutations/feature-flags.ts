import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { prisma } from "../../prisma";
import { invalidateFlagCache } from "../../feature-flags";
import { pubsub, PubSubEvent } from "../../pubsub";

const FeatureFlagResultType = builder.simpleObject("FeatureFlagResult", {
  fields: (t) => ({
    key: t.string(),
    enabled: t.boolean(),
    managedBy: t.string(),
    description: t.string({ nullable: true }),
  }),
});

builder.mutationField("updateFeatureFlag", (t) =>
  t.field({
    type: FeatureFlagResultType,
    args: {
      key: t.arg.string({ required: true }),
      enabled: t.arg.boolean({ required: true }),
    },
    resolve: async (_root, args) => {
      const flag = await prisma.featureFlag.findUnique({
        where: { key: args.key },
      });

      if (!flag) {
        throw new GraphQLError(`Feature flag "${args.key}" not found`);
      }

      if (flag.managedBy !== "user") {
        throw new GraphQLError(
          `Feature flag "${args.key}" is system-managed and cannot be toggled from the UI`,
        );
      }

      const updated = await prisma.featureFlag.update({
        where: { key: args.key },
        data: { enabled: args.enabled },
      });

      // Invalidate server cache and push real-time update to all clients
      invalidateFlagCache();
      pubsub.publish(PubSubEvent.FEATURE_FLAGS.CHANGED, {});

      return {
        key: updated.key,
        enabled: updated.enabled,
        managedBy: updated.managedBy,
        description: updated.description,
      };
    },
  }),
);
