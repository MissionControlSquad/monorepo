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
      transport
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

// Agents + their current environment binding (for the Environments-page binding table).
export const AGENT_ENVIRONMENT_BINDINGS_QUERY = gql`
  query AgentEnvironmentBindings {
    agents {
      id
      name
      identityEmoji
      environmentId
    }
  }
`;

export const ENVIRONMENT_LEASES_QUERY = gql`
  query EnvironmentLeases($environmentId: String) {
    environmentLeases(environmentId: $environmentId) {
      id
      environmentId
      status
      leasePolicy
      provider
      providerLeaseId
      cleanupStatus
      acquiredAt
      lastUsedAt
      expiresAt
    }
  }
`;

export const ENVIRONMENT_CUSTOM_IMAGES_QUERY = gql`
  query EnvironmentCustomImages($environmentId: String!) {
    environmentCustomImages(environmentId: $environmentId) {
      hasActive
      drift
      templates {
        id
        provider
        templateKind
        templateRef
        status
        capturedAt
      }
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
