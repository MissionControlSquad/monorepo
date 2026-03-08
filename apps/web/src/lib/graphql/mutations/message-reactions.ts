import { gql } from "urql";

export const TOGGLE_MESSAGE_REACTION = gql`
  mutation ToggleMessageReaction($messageId: String!, $profileId: String!, $emoji: String!) {
    toggleMessageReaction(messageId: $messageId, profileId: $profileId, emoji: $emoji) {
      id
      reactions {
        id
        profileId
        emoji
        profile {
          id
          displayName
          username
        }
      }
    }
  }
`;
