import { gql } from "urql";
import { PROFILE_WITH_AGENT_FIELDS } from "../fragments";

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
          ${PROFILE_WITH_AGENT_FIELDS}
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
    $workMode: String
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
      workMode: $workMode
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
      workMode
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
          ${PROFILE_WITH_AGENT_FIELDS}
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
    $workMode: String
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
      workMode: $workMode
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
      workMode
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
          ${PROFILE_WITH_AGENT_FIELDS}
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

// Parity §3.12 — first-class task labels.
export const ADD_TASK_LABEL = gql`
  mutation AddTaskLabel($taskId: String!, $name: String!, $color: String) {
    addTaskLabel(taskId: $taskId, name: $name, color: $color) {
      id
      labelId
      label {
        id
        name
        color
      }
    }
  }
`;

export const REMOVE_TASK_LABEL = gql`
  mutation RemoveTaskLabel($taskId: String!, $labelId: String!) {
    removeTaskLabel(taskId: $taskId, labelId: $labelId)
  }
`;
