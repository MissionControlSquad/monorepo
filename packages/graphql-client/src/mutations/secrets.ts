import { gql } from "urql";

// Epic #5: secrets vault mutations (admin). `value` is write-only.
export const CREATE_SECRET = gql`
  mutation CreateSecret(
    $name: String!
    $value: String!
    $description: String
    $providerId: String
  ) {
    createSecret(name: $name, value: $value, description: $description, providerId: $providerId) {
      id
    }
  }
`;

export const CREATE_USER_SECRET = gql`
  mutation CreateUserSecret($name: String!, $value: String!, $description: String) {
    createUserSecret(name: $name, value: $value, description: $description) {
      id
    }
  }
`;

export const CREATE_SECRET_PROVIDER = gql`
  mutation CreateSecretProvider($name: String!, $kind: String!, $config: JSON) {
    createSecretProvider(name: $name, kind: $kind, config: $config) {
      id
      name
      kind
    }
  }
`;

export const DELETE_SECRET_PROVIDER = gql`
  mutation DeleteSecretProvider($id: String!) {
    deleteSecretProvider(id: $id)
  }
`;

export const IMPORT_SECRETS = gql`
  mutation ImportSecrets($text: String!, $overwrite: Boolean) {
    importSecrets(text: $text, overwrite: $overwrite) {
      created
      skipped
      rotated
      invalidLines
    }
  }
`;

export const ROTATE_SECRET = gql`
  mutation RotateSecret($id: String!, $value: String!) {
    rotateSecret(id: $id, value: $value) {
      id
      currentVersion
    }
  }
`;

export const BIND_SECRET = gql`
  mutation BindSecret(
    $secretId: String!
    $scope: String!
    $envVarName: String!
    $agentId: String
    $adapterType: String
    $pinnedVersion: Int
  ) {
    bindSecret(
      secretId: $secretId
      scope: $scope
      envVarName: $envVarName
      agentId: $agentId
      adapterType: $adapterType
      pinnedVersion: $pinnedVersion
    ) {
      id
    }
  }
`;

export const UNBIND_SECRET = gql`
  mutation UnbindSecret($id: String!) {
    unbindSecret(id: $id)
  }
`;

export const UPDATE_SECRET = gql`
  mutation UpdateSecret($id: String!, $name: String, $description: String) {
    updateSecret(id: $id, name: $name, description: $description) {
      id
      name
      description
    }
  }
`;

export const SET_SECRET_STATUS = gql`
  mutation SetSecretStatus($id: String!, $status: String!) {
    setSecretStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

// Domain 7 P2: run + persist a secret provider health check.
export const CHECK_SECRET_PROVIDER_HEALTH = gql`
  mutation CheckSecretProviderHealth($id: String!) {
    checkSecretProviderHealth(id: $id) {
      id
      healthy
      lastCheckedAt
      lastError
    }
  }
`;
