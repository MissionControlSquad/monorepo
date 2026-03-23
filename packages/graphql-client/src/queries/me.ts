import { gql } from "urql";

export const ME_QUERY = gql`
  query Me {
    me {
      id
      kind
      displayName
      username
      avatarUrl
      bio
      user {
        id
        email
      }
    }
  }
`;

// Unique operation name prevents urql from linking to active ME_QUERY in profile screen
export const ME_DRAWER_QUERY = gql`
  query MeDrawer {
    me {
      id
      kind
      displayName
      username
      avatarUrl
      user {
        id
        email
      }
    }
  }
`;
