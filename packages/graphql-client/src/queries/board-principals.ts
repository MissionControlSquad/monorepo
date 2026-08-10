import { gql } from "urql";

// Board principals — first-class board identities (BOARD_CHAT). admin-only, workspace-scoped.
export const BOARD_PRINCIPALS_QUERY = gql`
  query BoardPrincipals {
    boardPrincipals {
      id
      name
      role
      keyPrefix
      revokedAt
      createdAt
    }
  }
`;
