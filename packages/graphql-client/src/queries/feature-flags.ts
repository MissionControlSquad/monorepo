import { gql } from "urql";

export const FEATURE_FLAGS_QUERY = gql`
  query FeatureFlags {
    featureFlags {
      key
      enabled
      managedBy
      description
    }
  }
`;
