import { builder } from "../builder";
import { getAllFlags } from "../../feature-flags";

const FeatureFlagType = builder.simpleObject("FeatureFlag", {
  fields: (t) => ({
    key: t.string(),
    enabled: t.boolean(),
    managedBy: t.string(),
    description: t.string({ nullable: true }),
  }),
});

builder.queryField("featureFlags", (t) =>
  t.field({
    type: [FeatureFlagType],
    resolve: async () => {
      return getAllFlags();
    },
  }),
);
