import { gql } from "urql";
import { PROFILE_FIELDS, PROFILE_MINIMAL_FIELDS, PROFILE_WITH_KIND_FIELDS } from "../fragments";

const CHANNEL_FIELDS = `
  id
  name
  slug
  visibility
  description
  projectId
  createdByProfileId
  createdAt
  updatedAt
  createdByProfile {
    ${PROFILE_WITH_KIND_FIELDS}
  }
  project {
    id
    name
  }
  members {
    id
    profileId
    role
    joinedAt
    lastReadAt
    profile {
      id
      kind
      displayName
      username
      avatarUrl
      agent {
        id
        role
        identityEmoji
        status
        currentTask
      }
    }
  }
`;

const CHANNEL_MESSAGE_FIELDS = `
  id
  channelId
  fromProfileId
  content
  createdAt
  updatedAt
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
    messageId
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
      ${PROFILE_FIELDS}
    }
  }
  reactions {
    id
    messageId
    profileId
    emoji
    profile {
      ${PROFILE_MINIMAL_FIELDS}
    }
  }
`;

export const CHANNELS_QUERY = gql`
  query Channels($profileId: String, $projectId: String, $visibility: String, $limit: Int) {
    channels(profileId: $profileId, projectId: $projectId, visibility: $visibility, limit: $limit) {
      ${CHANNEL_FIELDS}
      unreadCount(profileId: $profileId)
    }
  }
`;

export const CHANNEL_QUERY = gql`
  query Channel($id: String!) {
    channel(id: $id) {
      ${CHANNEL_FIELDS}
    }
  }
`;

export const CHANNEL_BY_SLUG_QUERY = gql`
  query ChannelBySlug($slug: String!) {
    channelBySlug(slug: $slug) {
      ${CHANNEL_FIELDS}
    }
  }
`;

export const CHANNEL_MESSAGES_QUERY = gql`
  query ChannelMessages($channelId: String!, $limit: Int) {
    channelMessages(channelId: $channelId, limit: $limit) {
      ${CHANNEL_MESSAGE_FIELDS}
    }
  }
`;

export const CHANNEL_MESSAGE_CONNECTION_QUERY = gql`
  query ChannelMessageConnection($channelId: String!, $first: Int, $before: String) {
    channelMessageConnection(channelId: $channelId, first: $first, before: $before) {
      messages {
        ${CHANNEL_MESSAGE_FIELDS}
      }
      hasOlder
    }
  }
`;

export const CHANNEL_PINNED_MESSAGES_QUERY = gql`
  query ChannelPinnedMessages($channelId: String!, $limit: Int) {
    channelPinnedMessages(channelId: $channelId, limit: $limit) {
      ${CHANNEL_MESSAGE_FIELDS}
    }
  }
`;

export const SEARCH_CHANNEL_MESSAGES_QUERY = gql`
  query SearchChannelMessages($channelId: String!, $query: String, $mentionedProfileId: String, $limit: Int) {
    searchChannelMessages(channelId: $channelId, query: $query, mentionedProfileId: $mentionedProfileId, limit: $limit) {
      ${CHANNEL_MESSAGE_FIELDS}
    }
  }
`;

export const PROFILES_QUERY = gql`
  query Profiles($limit: Int) {
    profiles(limit: $limit) {
      id
      kind
      displayName
      username
      avatarUrl
      agent {
        id
        role
        identityEmoji
      }
    }
  }
`;

export const PROFILE_QUERY = gql`
  query Profile($id: String!) {
    profile(id: $id) {
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
      agent {
        id
        name
        role
        identityEmoji
        status
      }
    }
  }
`;

const CHANNEL_LIST_ITEM = `
  id
  name
  slug
  visibility
`;

export const CHANNELS_IN_COMMON_QUERY = gql`
  query ChannelsInCommon($myProfileId: String!, $otherProfileId: String!, $limit: Int) {
    channelsInCommon(myProfileId: $myProfileId, otherProfileId: $otherProfileId, limit: $limit) {
      ${CHANNEL_LIST_ITEM}
    }
  }
`;
