import { gql } from "urql";

// ── Mobile-optimised (lean field sets, per-entity $id filter) ─────────────────

export const ON_NEW_CHANNEL_MESSAGE = gql`
  subscription OnNewChannelMessage($channelId: String!) {
    newChannelMessage(channelId: $channelId) {
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
        messageId
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

export const ON_AGENT_STATUS_CHANGE = gql`
  subscription OnAgentStatusChange($agentId: String!) {
    agentStatusChanged(agentId: $agentId) {
      id
      status
      detailedStatus
      statusMessage
      lastHeartbeat
    }
  }
`;

export const ON_TASK_UPDATED = gql`
  subscription OnTaskUpdated($taskId: String!) {
    taskUpdated(taskId: $taskId) {
      id
      status
    }
  }
`;

export const ON_NEW_MESSAGE = gql`
  subscription OnNewMessage($taskId: String!) {
    newMessage(taskId: $taskId) {
      id
      content
      createdAt
      fromProfile {
        id
        displayName
        avatarUrl
      }
    }
  }
`;

export const ON_NOTIFICATION = gql`
  subscription OnNotification($profileId: String!) {
    notification(profileId: $profileId) {
      id
      content
      task {
        id
        title
        taskNumber
      }
    }
  }
`;

// ── Web / full-featured subscriptions ────────────────────────────────────────

export const AGENT_STATUS_CHANGED_SUBSCRIPTION = gql`
  subscription AgentStatusChanged {
    agentStatusChanged {
      id
      name
      role
      status
      detailedStatus
      statusMessage
      currentTask
      currentTaskId
      avatar
      personality
      workspacePath
      identityEmoji
      level
      username
      lastHeartbeat
      setupStatus
      isOnVacation
      apiKeyPrefix
      createdBy
      createdAt
      updatedAt
    }
  }
`;

export const TASK_UPDATED_SUBSCRIPTION = gql`
  subscription TaskUpdated($taskId: String, $projectId: String) {
    taskUpdated(taskId: $taskId, projectId: $projectId) {
      id
      title
      description
      status
      priority
      createdByProfileId
      taskNumber
      tags
      dueDate
      createdAt
      updatedAt
      parentTaskId
      projectId
      blockedByTaskId
      assignees {
        id
        profileId
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
            lastHeartbeat
            status
            detailedStatus
            currentTaskId
          }
        }
      }
    }
  }
`;

export const ACTIVITY_CREATED_SUBSCRIPTION = gql`
  subscription ActivityCreated($projectId: String) {
    activityCreated(projectId: $projectId) {
      id
      type
      profileId
      taskId
      projectId
      message
      metadata
      createdAt
      profile {
        id
        displayName
        username
        avatarUrl
        agentId
      }
      task {
        id
        title
        taskNumber
        status
      }
    }
  }
`;

export const NOTIFICATION_CREATED_SUBSCRIPTION = gql`
  subscription NotificationCreated($agentId: String!) {
    notificationCreated(agentId: $agentId) {
      id
      mentionedAgentId
      content
      taskId
      messageId
      delivered
      deliveredAt
      createdAt
      task {
        id
        title
        taskNumber
        status
      }
    }
  }
`;

export const AGENT_ACTION_LOGGED_SUBSCRIPTION = gql`
  subscription AgentActionLogged($agentId: String, $projectId: String) {
    agentActionLogged(agentId: $agentId, projectId: $projectId) {
      id
      agentId
      taskId
      projectId
      actionType
      description
      metadata
      timestamp
      agent {
        id
        name
        identityEmoji
      }
      task {
        id
        title
        taskNumber
        status
      }
    }
  }
`;

export const MESSAGE_CREATED_SUBSCRIPTION = gql`
  subscription MessageCreated($taskId: String!) {
    messageCreated(taskId: $taskId) {
      id
      taskId
      fromProfileId
      content
      projectId
      createdAt
      fromProfile {
        id
        displayName
        username
        avatarUrl
      }
      task {
        id
        title
        taskNumber
        status
      }
      attachments {
        id
        messageId
        documentId
      }
      mentions {
        id
        messageId
        profileId
        profile {
          id
          displayName
          username
        }
      }
      reactions {
        id
        messageId
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

export const MESSAGE_REACTION_CHANGED_SUBSCRIPTION = gql`
  subscription MessageReactionChanged($taskId: String!) {
    messageReactionChanged(taskId: $taskId) {
      id
      reactions {
        id
        messageId
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

export const CHANNEL_MESSAGE_CREATED_SUBSCRIPTION = gql`
  subscription ChannelMessageCreated($channelId: String!) {
    channelMessageCreated(channelId: $channelId) {
      id
      channelId
      fromProfileId
      content
      createdAt
      fromProfile {
        id
        kind
        displayName
        username
        avatarUrl
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
          id
          displayName
          username
          avatarUrl
        }
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
    }
  }
`;

export const FEATURE_FLAGS_CHANGED_SUBSCRIPTION = gql`
  subscription FeatureFlagsChanged {
    featureFlagsChanged {
      key
      enabled
      managedBy
      description
    }
  }
`;

export const CHANNEL_MESSAGE_REACTION_CHANGED_SUBSCRIPTION = gql`
  subscription ChannelMessageReactionChanged($channelId: String!) {
    channelMessageReactionChanged(channelId: $channelId) {
      id
      reactions {
        id
        messageId
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
