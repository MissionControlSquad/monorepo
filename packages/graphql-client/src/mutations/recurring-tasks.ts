import { gql } from "urql";

export const CREATE_RECURRING_TASK = gql`
  mutation CreateRecurringTask(
    $title: String!
    $description: String!
    $recurrenceConfig: String!
    $status: String
    $priority: String
    $tags: [String!]
    $timezone: String
    $assigneeIds: [String!]
    $projectId: String
    $createdByProfileId: String
  ) {
    createRecurringTask(
      title: $title
      description: $description
      recurrenceConfig: $recurrenceConfig
      status: $status
      priority: $priority
      tags: $tags
      timezone: $timezone
      assigneeIds: $assigneeIds
      projectId: $projectId
      createdByProfileId: $createdByProfileId
    ) {
      id
      title
      description
      recurrenceConfig
      isActive
      nextDueAt
      createdAt
    }
  }
`;

export const UPDATE_RECURRING_TASK = gql`
  mutation UpdateRecurringTask(
    $id: String!
    $title: String
    $description: String
    $recurrenceConfig: String
    $status: String
    $priority: String
    $tags: [String!]
    $timezone: String
    $assigneeIds: [String!]
    $projectId: String
  ) {
    updateRecurringTask(
      id: $id
      title: $title
      description: $description
      recurrenceConfig: $recurrenceConfig
      status: $status
      priority: $priority
      tags: $tags
      timezone: $timezone
      assigneeIds: $assigneeIds
      projectId: $projectId
    ) {
      id
      title
      description
      recurrenceConfig
      isActive
      nextDueAt
      updatedAt
    }
  }
`;

export const PAUSE_RECURRING_TASK = gql`
  mutation PauseRecurringTask($id: String!) {
    pauseRecurringTask(id: $id) {
      id
      isActive
      nextDueAt
    }
  }
`;

export const RESUME_RECURRING_TASK = gql`
  mutation ResumeRecurringTask($id: String!) {
    resumeRecurringTask(id: $id) {
      id
      isActive
      nextDueAt
    }
  }
`;

export const TRIGGER_RECURRING_TASK = gql`
  mutation TriggerRecurringTask($id: String!) {
    triggerRecurringTask(id: $id)
  }
`;

export const DELETE_RECURRING_TASK = gql`
  mutation DeleteRecurringTask($id: String!) {
    deleteRecurringTask(id: $id)
  }
`;
