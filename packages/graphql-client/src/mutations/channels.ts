import { gql } from "urql";
import { PROFILE_FIELDS, PROFILE_MINIMAL_FIELDS, PROFILE_WITH_KIND_FIELDS } from "../fragments";

const CHANNEL_MESSAGE_FRAGMENT = `
  id
  channelId
  fromProfileId
  content
  createdAt
  pinnedAt
  pinnedByProfileId
  pinnedByProfile {
    ${PROFILE_MINIMAL_FIELDS}
  }
  fromProfile {
    ${PROFILE_WITH_KIND_FIELDS}
  }
  attachments {
    id
    documentId
    document {
      id
      title
      type
      storageKey
      fileName
      mimeType
      fileSize
    }
  }
  mentions {
    id
    profileId
    profile {
      ${PROFILE_MINIMAL_FIELDS}
    }
  }
  reactions {
    id
    profileId
    emoji
    profile {
      ${PROFILE_MINIMAL_FIELDS}
    }
  }
`;

export const CREATE_CHANNEL = gql`
  mutation CreateChannel(
    $name: String!
    $slug: String!
    $visibility: String!
    $description: String
    $createdByProfileId: String!
    $projectId: String
  ) {
    createChannel(
      name: $name
      slug: $slug
      visibility: $visibility
      description: $description
      createdByProfileId: $createdByProfileId
      projectId: $projectId
    ) {
      id
      name
      slug
      visibility
      description
      createdByProfileId
      createdAt
      members {
        id
        profileId
        role
        profile {
          ${PROFILE_MINIMAL_FIELDS}
        }
      }
    }
  }
`;

export const START_CONVERSATION = gql`
  mutation StartConversation($myProfileId: String!, $otherProfileId: String!) {
    startConversation(myProfileId: $myProfileId, otherProfileId: $otherProfileId) {
      id
      name
      slug
      visibility
      members {
        id
        profileId
        profile {
          ${PROFILE_FIELDS}
        }
      }
    }
  }
`;

export const JOIN_CHANNEL = gql`
  mutation JoinChannel($channelId: String!, $profileId: String!) {
    joinChannel(channelId: $channelId, profileId: $profileId) {
      id
      channelId
      profileId
      role
      joinedAt
      channel {
        id
        name
        slug
      }
      profile {
        ${PROFILE_MINIMAL_FIELDS}
      }
    }
  }
`;

export const ADD_CHANNEL_MEMBER = gql`
  mutation AddChannelMember($channelId: String!, $profileId: String!, $addedByProfileId: String!) {
    addChannelMember(
      channelId: $channelId
      profileId: $profileId
      addedByProfileId: $addedByProfileId
    ) {
      id
      channelId
      profileId
      role
      profile {
        ${PROFILE_MINIMAL_FIELDS}
      }
    }
  }
`;

export const LEAVE_CHANNEL = gql`
  mutation LeaveChannel($channelId: String!, $profileId: String!) {
    leaveChannel(channelId: $channelId, profileId: $profileId)
  }
`;

export const REMOVE_CHANNEL_MEMBER = gql`
  mutation RemoveChannelMember(
    $channelId: String!
    $profileId: String!
    $removedByProfileId: String!
  ) {
    removeChannelMember(
      channelId: $channelId
      profileId: $profileId
      removedByProfileId: $removedByProfileId
    )
  }
`;

export const CREATE_CHANNEL_MESSAGE = gql`
  mutation CreateChannelMessage(
    $channelId: String!
    $fromProfileId: String!
    $content: String!
    $attachmentIds: [String!]
  ) {
    createChannelMessage(
      channelId: $channelId
      fromProfileId: $fromProfileId
      content: $content
      attachmentIds: $attachmentIds
    ) {
      ${CHANNEL_MESSAGE_FRAGMENT}
    }
  }
`;

export const TOGGLE_CHANNEL_MESSAGE_REACTION = gql`
  mutation ToggleChannelMessageReaction($messageId: String!, $profileId: String!, $emoji: String!) {
    toggleChannelMessageReaction(messageId: $messageId, profileId: $profileId, emoji: $emoji) {
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

export const UPDATE_CHANNEL_MESSAGE = gql`
  mutation UpdateChannelMessage($messageId: String!, $profileId: String!, $content: String!) {
    updateChannelMessage(messageId: $messageId, profileId: $profileId, content: $content) {
      ${CHANNEL_MESSAGE_FRAGMENT}
    }
  }
`;

export const DELETE_CHANNEL_MESSAGE = gql`
  mutation DeleteChannelMessage($messageId: String!, $profileId: String!) {
    deleteChannelMessage(messageId: $messageId, profileId: $profileId)
  }
`;

export const DELETE_CHANNEL = gql`
  mutation DeleteChannel($channelId: String!, $profileId: String!) {
    deleteChannel(channelId: $channelId, profileId: $profileId)
  }
`;

export const MARK_CHANNEL_READ = gql`
  mutation MarkChannelRead($channelId: String!, $profileId: String!) {
    markChannelRead(channelId: $channelId, profileId: $profileId)
  }
`;

export const PIN_CHANNEL_MESSAGE = gql`
  mutation PinChannelMessage($messageId: String!, $profileId: String!) {
    pinChannelMessage(messageId: $messageId, profileId: $profileId) {
      ${CHANNEL_MESSAGE_FRAGMENT}
    }
  }
`;

export const UNPIN_CHANNEL_MESSAGE = gql`
  mutation UnpinChannelMessage($messageId: String!, $profileId: String!) {
    unpinChannelMessage(messageId: $messageId, profileId: $profileId) {
      ${CHANNEL_MESSAGE_FRAGMENT}
    }
  }
`;
