import { gql } from "urql";

// Tier D / Phase 3: Environment writes (admin, ENVIRONMENTS-gated). Config secrets are passed as
// {secretRef:{name}} pointers — plaintext values never round-trip through the client.
const ENV_FIELDS = `
  id
  name
  description
  driver
  status
  transport
  configPublic
  envVars
  metadata
  createdAt
`;

export const CREATE_ENVIRONMENT = gql`
  mutation CreateEnvironment(
    $name: String!
    $driver: String!
    $description: String
    $config: JSON
    $envVars: JSON
    $metadata: JSON
  ) {
    createEnvironment(
      name: $name
      driver: $driver
      description: $description
      config: $config
      envVars: $envVars
      metadata: $metadata
    ) { ${ENV_FIELDS} }
  }
`;

export const UPDATE_ENVIRONMENT = gql`
  mutation UpdateEnvironment(
    $id: String!
    $name: String
    $driver: String
    $description: String
    $config: JSON
    $envVars: JSON
    $metadata: JSON
  ) {
    updateEnvironment(
      id: $id
      name: $name
      driver: $driver
      description: $description
      config: $config
      envVars: $envVars
      metadata: $metadata
    ) { ${ENV_FIELDS} }
  }
`;

export const ARCHIVE_ENVIRONMENT = gql`
  mutation ArchiveEnvironment($id: String!) {
    archiveEnvironment(id: $id) { id status }
  }
`;

export const DELETE_ENVIRONMENT = gql`
  mutation DeleteEnvironment($id: String!) {
    deleteEnvironment(id: $id)
  }
`;

export const PROBE_ENVIRONMENT = gql`
  mutation ProbeEnvironment($id: String!) {
    probeEnvironment(id: $id) {
      ok
      driver
      summary
      details
    }
  }
`;

export const SET_AGENT_ENVIRONMENT = gql`
  mutation SetAgentEnvironment($agentId: String!, $environmentId: String) {
    setAgentEnvironment(agentId: $agentId, environmentId: $environmentId) {
      id
      environmentId
    }
  }
`;

export const DESTROY_ENVIRONMENT_LEASE = gql`
  mutation DestroyEnvironmentLease($leaseId: String!) {
    destroyEnvironmentLease(leaseId: $leaseId)
  }
`;

export const SET_WORKSPACE_EXECUTION_MODE = gql`
  mutation SetWorkspaceExecutionMode($executionMode: String, $enableIsolatedWorkspaces: Boolean) {
    setWorkspaceExecutionMode(
      executionMode: $executionMode
      enableIsolatedWorkspaces: $enableIsolatedWorkspaces
    ) {
      executionMode
      enableIsolatedWorkspaces
    }
  }
`;
