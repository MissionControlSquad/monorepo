import { gql } from "urql";

// Parity §3 #7: user-scoped secret definitions (admin) + declarations (self). `value` is write-only.
export const CREATE_USER_SECRET_DEFINITION = gql`
  mutation CreateUserSecretDefinition(
    $key: String!
    $displayName: String!
    $description: String
    $required: Boolean
  ) {
    createUserSecretDefinition(
      key: $key
      displayName: $displayName
      description: $description
      required: $required
    ) {
      id
      key
      displayName
      required
    }
  }
`;

export const DELETE_USER_SECRET_DEFINITION = gql`
  mutation DeleteUserSecretDefinition($id: String!) {
    deleteUserSecretDefinition(id: $id)
  }
`;

export const DECLARE_USER_SECRET = gql`
  mutation DeclareUserSecret($definitionId: String!, $value: String!) {
    declareUserSecret(definitionId: $definitionId, value: $value) {
      id
      status
    }
  }
`;
