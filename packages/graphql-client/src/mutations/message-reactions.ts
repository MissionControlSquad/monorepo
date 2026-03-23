import { gql } from "urql";
import { PROFILE_MINIMAL_FIELDS } from "../fragments";

export const TOGGLE_MESSAGE_REACTION = gql`
  mutation ToggleMessageReaction($messageId: String!, $profileId: String!, $emoji: String!) {
    toggleMessageReaction(messageId: $messageId, profileId: $profileId, emoji: $emoji) {
      id
      reactions {
        id
        profileId
        emoji
        profile {
          ${PROFILE_MINIMAL_FIELDS}
        }
      }
    }
  }
`;
