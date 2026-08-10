import { gql } from "urql";

// Create a board principal — returns the plaintext board key EXACTLY ONCE (shown, never stored).
export const CREATE_BOARD_PRINCIPAL = gql`
  mutation CreateBoardPrincipal($name: String!, $role: String) {
    createBoardPrincipal(name: $name, role: $role) {
      id
      name
      role
      keyPrefix
      plainKey
    }
  }
`;

export const REVOKE_BOARD_PRINCIPAL = gql`
  mutation RevokeBoardPrincipal($id: String!) {
    revokeBoardPrincipal(id: $id) {
      id
      revokedAt
    }
  }
`;
