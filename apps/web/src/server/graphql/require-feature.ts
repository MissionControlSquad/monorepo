import { GraphQLError } from "graphql";
import { isFeatureEnabled } from "../feature-flags";

/**
 * Throws a GraphQL error if the given feature flag is disabled.
 * Use at the top of any resolver that should be gated behind a feature flag.
 */
export async function requireFeature(flag: string): Promise<void> {
  const enabled = await isFeatureEnabled(flag);
  if (!enabled) {
    throw new GraphQLError(`Feature '${flag}' is not available on your current plan`, {
      extensions: { code: "FEATURE_DISABLED", feature: flag },
    });
  }
}
