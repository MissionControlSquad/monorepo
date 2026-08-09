import { gql } from "urql";

// AI Tools doctor - reusable inventory selection (local + remote share the same shape).
const INVENTORY_FIELDS = `
  os
  nodeInstalled
  nodeVersion
  nodeDocsUrl
  nodeInstall { os label command kind note needs }
  tools {
    key
    displayName
    binName
    summary
    docsUrl
    installed
    version
    needsNode
    installMethods { os label command kind note needs }
  }
`;

// LOCAL (control-plane host) inventory. `os` previews another OS's install commands.
export const AI_RUNTIME_INVENTORY_QUERY = gql`
  query AiRuntimeInventory($os: String) {
    aiRuntimeInventory(os: $os) {
      ${INVENTORY_FIELDS}
    }
  }
`;

// REMOTE machines: each runner's last-reported inventory of its own host.
export const REPORTED_RUNTIME_INVENTORIES_QUERY = gql`
  query ReportedRuntimeInventories {
    reportedRuntimeInventories {
      runnerId
      runnerName
      reportedAt
      inventory {
        ${INVENTORY_FIELDS}
      }
    }
  }
`;
