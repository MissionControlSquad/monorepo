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

// Single plugin + manifest + config + error, for the detail page.
export const PLUGIN_QUERY = gql`
  query Plugin($pluginId: String!) {
    plugin(pluginId: $pluginId) {
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
      manifest
      config
      lastError
    }
  }
`;
