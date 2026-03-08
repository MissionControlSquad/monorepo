import { builder } from "../builder";
import { pubsub, PubSubEvent } from "../../pubsub";
import { getAllFlags } from "../../feature-flags";

const FeatureFlagType = builder.simpleObject("FeatureFlagSub", {
  fields: (t) => ({
    key: t.string(),
    enabled: t.boolean(),
    managedBy: t.string(),
    description: t.string({ nullable: true }),
  }),
});

builder.subscriptionField("featureFlagsChanged", (t) =>
  t.field({
    type: [FeatureFlagType],
    subscribe: () => pubsub.subscribe(PubSubEvent.FEATURE_FLAGS.CHANGED),
    resolve: async () => {
      return getAllFlags();
    },
  }),
);
