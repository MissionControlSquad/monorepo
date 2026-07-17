import { gql } from "urql";

// Tier D / Phase 3: Environment reads. `configPublic` is masked (secret-refs → "secret:<name>").
export const ENVIRONMENTS_QUERY = gql`
  query Environments {
    environments {
      id
      name
      description
      driver
      status
      configPublic
      envVars
      metadata
      createdAt
    }
  }
`;

export const ENVIRONMENT_CAPABILITIES_QUERY = gql`
  query EnvironmentCapabilities {
    environmentCapabilities {
      drivers
      sandboxProviders {
        key
        displayName
        isolating
        credentialKeys
      }
    }
  }
`;

export const ENVIRONMENT_DELETE_BLAST_RADIUS_QUERY = gql`
  query EnvironmentDeleteBlastRadius($id: String!) {
    environmentDeleteBlastRadius(id: $id) {
      deletable
      referencingAgentCount
      reasons
    }
  }
`;

export const WORKSPACE_EXECUTION_POLICY_QUERY = gql`
  query WorkspaceExecutionPolicy {
    workspaceExecutionPolicy {
      executionMode
      enableIsolatedWorkspaces
    }
  }
`;
