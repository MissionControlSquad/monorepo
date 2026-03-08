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
