import { gql } from "urql";

// Epic #6: plugin registry read.
export const PLUGINS_QUERY = gql`
  query Plugins {
    plugins {
      id
      pluginId
      name
      version
      displayName
      description
      category
      capabilities
      status
      enabled
    }
  }
`;
