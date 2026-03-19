import { gql } from "urql";

export const ACTIVITIES_CONNECTION_QUERY = gql`
  query ActivitiesConnection($first: Int, $after: String, $projectId: String) {
    activitiesConnection(first: $first, after: $after, projectId: $projectId) {
      activities {
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
      hasMore
    }
  }
`;

export const ACTIVITIES_BY_TASK_QUERY = gql`
  query ActivitiesByTask($taskId: String!, $limit: Int) {
    activitiesByTask(taskId: $taskId, limit: $limit) {
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
      }
    }
  }
`;

export const ACTIVITIES_BY_AGENT_QUERY = gql`
  query ActivitiesByAgent($agentId: String!, $limit: Int) {
    activitiesByAgent(agentId: $agentId, limit: $limit) {
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

export const ACTIVITIES_FOR_AGENT_QUERY = gql`
  query ActivitiesForAgent($agentId: String!, $limit: Int, $projectId: String) {
    activitiesForAgent(agentId: $agentId, limit: $limit, projectId: $projectId) {
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
