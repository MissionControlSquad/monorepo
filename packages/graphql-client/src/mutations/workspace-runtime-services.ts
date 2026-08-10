import { gql } from "urql";
import { WORKSPACE_RUNTIME_SERVICE_FIELDS } from "../queries/workspace-runtime-services";

export const START_WORKSPACE_RUNTIME_SERVICE = gql`
  mutation StartWorkspaceRuntimeService(
    $executionWorkspaceId: String!
    $name: String!
    $command: String!
    $reuseKey: String!
    $port: Int
    $healthCheckUrl: String
    $stopPolicy: String
  ) {
    startWorkspaceRuntimeService(
      executionWorkspaceId: $executionWorkspaceId
      name: $name
      command: $command
      reuseKey: $reuseKey
      port: $port
      healthCheckUrl: $healthCheckUrl
      stopPolicy: $stopPolicy
    ) {
      ${WORKSPACE_RUNTIME_SERVICE_FIELDS}
    }
  }
`;

export const STOP_WORKSPACE_RUNTIME_SERVICE = gql`
  mutation StopWorkspaceRuntimeService($id: String!, $reason: String) {
    stopWorkspaceRuntimeService(id: $id, reason: $reason) {
      ${WORKSPACE_RUNTIME_SERVICE_FIELDS}
    }
  }
`;

export const SET_WORKSPACE_RUNTIME_SERVICE_HEALTH = gql`
  mutation SetWorkspaceRuntimeServiceHealth($id: String!, $health: String!, $runToken: String) {
    setWorkspaceRuntimeServiceHealth(id: $id, health: $health, runToken: $runToken) {
      ${WORKSPACE_RUNTIME_SERVICE_FIELDS}
    }
  }
`;
