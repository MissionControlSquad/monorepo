import { gql } from "urql";

// ── Me ──────────────────────────────────────────────────────────

export const ME_QUERY = gql`
  query Me {
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

// ── Tasks ────────────────────────────────────────────────────────

const TASK_LIST_FIELDS = `
  id
  title
  description
  status
  priority
  createdAt
  updatedAt
  dueDate
  tags
  taskNumber
  parentTaskId
  projectId
  assignees {
    id
    profileId
    profile {
      id
      displayName
      username
      avatarUrl
    }
  }
`;

const TASK_DETAIL_FIELDS = `
  id
  title
  description
  status
  priority
  createdAt
  updatedAt
  dueDate
  tags
  taskNumber
  parentTaskId
  projectId
  blockedByTaskId
  createdByProfile {
    id
    displayName
    username
    avatarUrl
  }
  parentTask {
    id
    title
    taskNumber
    status
  }
  project {
    id
    name
  }
  assignees {
    id
    profileId
    assignedAt
    profile {
      id
      displayName
      username
      avatarUrl
      agentId
      agent {
        id
        name
        identityEmoji
        status
      }
    }
  }
`;

export const TASKS_QUERY = gql`
  query Tasks($limit: Int, $projectId: String) {
    tasks(limit: $limit, projectId: $projectId) {
      ${TASK_LIST_FIELDS}
    }
  }
`;

export const TASK_QUERY = gql`
  query Task($id: String!) {
    task(id: $id) {
      ${TASK_DETAIL_FIELDS}
    }
  }
`;

export const TASKS_BY_STATUS_QUERY = gql`
  query TasksByStatus($status: String!, $projectId: String, $limit: Int) {
    tasksByStatus(status: $status, projectId: $projectId, limit: $limit) {
      ${TASK_LIST_FIELDS}
    }
  }
`;

// ── Agents ───────────────────────────────────────────────────────

export const AGENTS_QUERY = gql`
  query Agents {
    agents {
      id
      name
      role
      status
      detailedStatus
      statusMessage
      currentTaskId
      currentTask
      identityEmoji
      level
      username
      lastHeartbeat
      isOnVacation
      profile {
        id
        displayName
        username
        avatarUrl
      }
    }
  }
`;

export const AGENT_QUERY = gql`
  query Agent($id: String!) {
    agent(id: $id) {
      id
      name
      role
      status
      detailedStatus
      statusMessage
      currentTaskId
      currentTask
      identityEmoji
      level
      username
      lastHeartbeat
      isOnVacation
      currentTaskRef {
        id
        title
        taskNumber
        status
      }
      profile {
        id
        displayName
        username
        avatarUrl
      }
    }
  }
`;

// ── Channels ─────────────────────────────────────────────────────

const CHANNEL_MESSAGE_FIELDS = `
  id
  channelId
  fromProfileId
  content
  createdAt
  updatedAt
  fromProfile {
    id
    kind
    displayName
    username
    avatarUrl
  }
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
`;

export const CHANNELS_QUERY = gql`
  query Channels($profileId: String, $limit: Int) {
    channels(profileId: $profileId, limit: $limit) {
      id
      name
      slug
      visibility
      description
      createdAt
      unreadCount(profileId: $profileId)
      members {
        id
        profileId
        role
        profile {
          id
          kind
          displayName
          username
          avatarUrl
        }
      }
    }
  }
`;

export const CHANNEL_QUERY = gql`
  query Channel($id: String!) {
    channel(id: $id) {
      id
      name
      slug
      visibility
      description
      createdAt
      members {
        id
        profileId
        role
        profile {
          id
          kind
          displayName
          username
          avatarUrl
        }
      }
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
