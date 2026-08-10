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

// Capability grants for a plugin (PLUGIN_RUNTIME). Powers the fail-closed grants panel on the detail
// page — a capability the plugin declared but that has no grant row is refused at runtime.
export const PLUGIN_GRANTS_QUERY = gql`
  query PluginGrants($pluginId: String!) {
    pluginGrants(pluginId: $pluginId) {
      id
      pluginId
      capability
      grantedByProfileId
      grantedAt
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
