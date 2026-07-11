import { gql } from "urql";

// Epic #5: secrets vault mutations (admin). `value` is write-only.
export const CREATE_SECRET = gql`
  mutation CreateSecret($name: String!, $value: String!, $description: String) {
    createSecret(name: $name, value: $value, description: $description) {
      id
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
