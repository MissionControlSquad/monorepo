import { gql } from "urql";

export const CREATE_TASK = gql`
  mutation CreateTask(
    $title: String!
    $description: String!
    $assigneeIds: [String!]!
    $createdById: String
    $priority: String
    $dueDate: String
    $tags: [String!]
    $parentTaskId: String
    $projectId: String
    $blockedByTaskId: String
  ) {
    createTask(
      title: $title
      description: $description
      assigneeIds: $assigneeIds
      createdById: $createdById
      priority: $priority
      dueDate: $dueDate
      tags: $tags
      parentTaskId: $parentTaskId
      projectId: $projectId
      blockedByTaskId: $blockedByTaskId
    ) {
      id
      title
      description
      status
      priority
      taskNumber
      tags
      dueDate
      createdAt
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
          }
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
    $parentTaskId: String
    $projectId: String
    $blockedByTaskId: String
  ) {
    createTaskFromDashboard(
      title: $title
      description: $description
      priority: $priority
      assigneeIds: $assigneeIds
      dueDate: $dueDate
      tags: $tags
      parentTaskId: $parentTaskId
      projectId: $projectId
      blockedByTaskId: $blockedByTaskId
    ) {
      id
      title
      description
      status
      priority
      taskNumber
      tags
      dueDate
      createdAt
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
          }
        }
      }
    }
  }
`;

export const UPDATE_TASK = gql`
  mutation UpdateTask(
    $id: String!
    $title: String
    $description: String
    $status: String
    $assigneeIds: [String!]
    $priority: String
    $dueDate: String
    $tags: [String!]
    $parentTaskId: String
    $blockedByTaskId: String
    $agentId: String
    $projectId: String
  ) {
    updateTask(
      id: $id
      title: $title
      description: $description
      status: $status
      assigneeIds: $assigneeIds
      priority: $priority
      dueDate: $dueDate
      tags: $tags
      parentTaskId: $parentTaskId
      blockedByTaskId: $blockedByTaskId
      agentId: $agentId
      projectId: $projectId
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
          }
        }
      }
    }
  }
`;

export const DELETE_TASK = gql`
  mutation DeleteTask($id: String!, $agentId: String!) {
    deleteTask(id: $id, agentId: $agentId)
  }
`;
