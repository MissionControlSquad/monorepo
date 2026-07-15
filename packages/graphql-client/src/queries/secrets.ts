import { gql } from "urql";

// Epic #5: secrets vault reads (metadata only — never a value).
export const SECRETS_QUERY = gql`
  query Secrets {
    secrets {
      id
      name
      description
      currentVersion
      status
      providerId
      createdAt
      bindings {
        id
        scope
        agentId
        adapterType
        envVarName
        pinnedVersion
      }
      versions {
        version
        retiredAt
        createdAt
      }
    }
  }
`;

export const SECRET_PROVIDERS_QUERY = gql`
  query SecretProviders {
    secretProviders {
      id
      name
      kind
      config
      healthy
      lastError
      createdAt
    }
  }
`;

export const SECRET_ACCESS_EVENTS_QUERY = gql`
  query SecretAccessEvents($secretId: String!, $limit: Int) {
    secretAccessEvents(secretId: $secretId, limit: $limit) {
      id
      action
      actorType
      actorId
      version
      createdAt
    }
  }
`;
