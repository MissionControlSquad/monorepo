import { gql } from "urql";

export const UPDATE_MY_PROFILE = gql`
  mutation UpdateMyProfile($displayName: String, $bio: String, $avatarUrl: String) {
    updateMyProfile(displayName: $displayName, bio: $bio, avatarUrl: $avatarUrl) {
      id
      displayName
      username
      avatarUrl
      bio
    }
  }
`;
