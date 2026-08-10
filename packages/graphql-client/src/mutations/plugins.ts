import { gql } from "urql";

// Epic #6: plugin registry mutations.
export const INSTALL_PLUGIN = gql`
  mutation InstallPlugin($manifest: JSON!) {
    installPlugin(manifest: $manifest) {
      id
      pluginId
      version
    }
  }
`;

export const SET_PLUGIN_ENABLED = gql`
  mutation SetPluginEnabled($pluginId: String!, $enabled: Boolean!) {
    setPluginEnabled(pluginId: $pluginId, enabled: $enabled) {
      id
      enabled
      status
    }
  }
`;

export const UNINSTALL_PLUGIN = gql`
  mutation UninstallPlugin($pluginId: String!) {
    uninstallPlugin(pluginId: $pluginId)
  }
`;

export const SET_PLUGIN_CONFIG = gql`
  mutation SetPluginConfig($pluginId: String!, $config: JSON!) {
    setPluginConfig(pluginId: $pluginId, config: $config) {
      id
      config
    }
  }
`;

// PLUGIN_RUNTIME: grant/revoke a capability to a plugin (admin). Fail-closed — the runtime refuses any
// capability without a grant.
export const GRANT_PLUGIN_CAPABILITY = gql`
  mutation GrantPluginCapability($pluginId: String!, $capability: String!) {
    grantPluginCapability(pluginId: $pluginId, capability: $capability) {
      id
      capability
      grantedAt
    }
  }
`;

export const REVOKE_PLUGIN_CAPABILITY = gql`
  mutation RevokePluginCapability($pluginId: String!, $capability: String!) {
    revokePluginCapability(pluginId: $pluginId, capability: $capability)
  }
`;

export const CLEAR_PLUGIN_ERROR = gql`
  mutation ClearPluginError($pluginId: String!) {
    clearPluginError(pluginId: $pluginId) {
      id
      status
      lastError
    }
  }
`;
