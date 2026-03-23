import { gql } from "urql";
import { PROFILE_FIELDS } from "../fragments";

const ACTIVITY_FIELDS = `
  id
  type
  profileId
  taskId
  projectId
  message
  metadata
  createdAt
`;

export const ACTIVITIES_CONNECTION_QUERY = gql`
  query ActivitiesConnection($first: Int, $after: String, $projectId: String) {
    activitiesConnection(first: $first, after: $after, projectId: $projectId) {
      activities {
        ${ACTIVITY_FIELDS}
        profile {
          ${PROFILE_FIELDS}
          agentId
        }
        task {
          id
          title
          taskNumber
          status
        }
      }
      hasMore
    }
  }
`;

export const ACTIVITIES_BY_TASK_QUERY = gql`
  query ActivitiesByTask($taskId: String!, $limit: Int) {
    activitiesByTask(taskId: $taskId, limit: $limit) {
      ${ACTIVITY_FIELDS}
      profile {
        ${PROFILE_FIELDS}
      }
    }
  }
`;

export const ACTIVITIES_BY_AGENT_QUERY = gql`
  query ActivitiesByAgent($agentId: String!, $limit: Int) {
    activitiesByAgent(agentId: $agentId, limit: $limit) {
      ${ACTIVITY_FIELDS}
      profile {
        ${PROFILE_FIELDS}
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

export const ACTIVITIES_FOR_AGENT_QUERY = gql`
  query ActivitiesForAgent($agentId: String!, $limit: Int, $projectId: String) {
    activitiesForAgent(agentId: $agentId, limit: $limit, projectId: $projectId) {
      ${ACTIVITY_FIELDS}
      profile {
        ${PROFILE_FIELDS}
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
