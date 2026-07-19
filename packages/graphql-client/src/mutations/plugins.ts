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
