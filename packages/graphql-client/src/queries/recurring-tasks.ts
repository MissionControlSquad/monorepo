import { gql } from "urql";

export const RECURRING_TASKS_QUERY = gql`
  query RecurringTasks($projectId: String, $includeInactive: Boolean) {
    recurringTasks(projectId: $projectId, includeInactive: $includeInactive) {
      id
      title
      description
      status
      priority
      tags
      recurrenceConfig
      isActive
      timezone
      nextDueAt
      lastGeneratedAt
      createdByProfileId
      projectId
      createdAt
      updatedAt
      assignees {
        id
        profileId
        profile {
          id
          displayName
          avatarUrl
          kind
        }
      }
    }
  }
`;

export const RECURRING_TASK_QUERY = gql`
  query RecurringTask($id: String!) {
    recurringTask(id: $id) {
      id
      title
      description
      status
      priority
      tags
      recurrenceConfig
      isActive
      timezone
      nextDueAt
      lastGeneratedAt
      createdByProfileId
      projectId
      createdAt
      updatedAt
      assignees {
        id
        profileId
        profile {
          id
          displayName
          avatarUrl
          kind
        }
      }
      generatedTasks {
        id
        title
        status
        taskNumber
        createdAt
      }
    }
  }
`;

export const RECURRING_TASKS_BY_ASSIGNEE_QUERY = gql`
  query RecurringTasksByAssignee($agentId: String!, $projectId: String, $includeInactive: Boolean) {
    recurringTasksByAssignee(
      agentId: $agentId
      projectId: $projectId
      includeInactive: $includeInactive
    ) {
      id
      title
      description
      status
      priority
      tags
      recurrenceConfig
      isActive
      timezone
      nextDueAt
      lastGeneratedAt
      projectId
      createdAt
      updatedAt
      assignees {
        id
        profileId
        profile {
          id
          displayName
          avatarUrl
          kind
        }
      }
    }
  }
`;
