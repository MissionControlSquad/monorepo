import { gql } from "urql";

export const UPDATE_FEATURE_FLAG = gql`
  mutation UpdateFeatureFlag($key: String!, $enabled: Boolean!) {
    updateFeatureFlag(key: $key, enabled: $enabled) {
      key
      enabled
      managedBy
      description
    }
  }
`;
