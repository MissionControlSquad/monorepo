import { gql } from "urql";

export const UPDATE_TASK = gql`
  mutation UpdateTask(
    $id: String!
    $title: String
    $description: String
    $status: String
    $priority: String
    $dueDate: String
    $tags: [String!]
  ) {
    updateTask(
      id: $id
      title: $title
      description: $description
      status: $status
      priority: $priority
      dueDate: $dueDate
      tags: $tags
    ) {
      id
      title
      description
      status
      priority
      taskNumber
      tags
      dueDate
      updatedAt
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
    }
  }
`;

export const CREATE_TASK_FROM_DASHBOARD = gql`
  mutation CreateTaskFromDashboard(
    $title: String!
    $description: String!
    $priority: String
    $assigneeIds: [String!]
    $dueDate: String
    $tags: [String!]
    $projectId: String
  ) {
    createTaskFromDashboard(
      title: $title
      description: $description
      priority: $priority
      assigneeIds: $assigneeIds
      dueDate: $dueDate
      tags: $tags
      projectId: $projectId
    ) {
      id
      title
      status
      priority
      taskNumber
      createdAt
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
    }
  }
`;

export const CREATE_CHANNEL_MESSAGE = gql`
  mutation CreateChannelMessage(
    $channelId: String!
    $fromProfileId: String!
    $content: String!
  ) {
    createChannelMessage(
      channelId: $channelId
      fromProfileId: $fromProfileId
      content: $content
    ) {
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
    }
  }
`;

export const MARK_CHANNEL_READ = gql`
  mutation MarkChannelRead($channelId: String!, $profileId: String!) {
    markChannelRead(channelId: $channelId, profileId: $profileId)
  }
`;
