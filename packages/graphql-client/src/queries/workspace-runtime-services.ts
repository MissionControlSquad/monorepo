import { gql } from "urql";

export const WORKSPACE_RUNTIME_SERVICE_FIELDS = `
  id
  executionWorkspaceId
  name
  command
  port
  reuseKey
  status
  healthCheckUrl
  healthStatus
  lastHealthAt
  stopPolicy
  pid
  providerRef
  stopReason
  lastUsedAt
  startedAt
  stoppedAt
  createdAt
`;

export const WORKSPACE_RUNTIME_SERVICES_QUERY = gql`
  query WorkspaceRuntimeServices($executionWorkspaceId: String) {
    workspaceRuntimeServices(executionWorkspaceId: $executionWorkspaceId) {
      ${WORKSPACE_RUNTIME_SERVICE_FIELDS}
    }
  }
`;
