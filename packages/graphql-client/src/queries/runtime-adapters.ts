import { gql } from "urql";

// Tier D: available runtime adapters for runner/agent execution.
export const RUNTIME_ADAPTERS_QUERY = gql`
  query RuntimeAdapters {
    runtimeAdapters {
      key
      displayName
      requiresTemplate
      supportsModel
      models
    }
  }
`;
