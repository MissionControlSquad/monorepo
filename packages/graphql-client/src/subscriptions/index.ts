import { gql } from "urql";

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
