import { gql } from "urql";

export const TASKS_PENDING_REVIEW_QUERY = gql`
  query TasksPendingReview($agentId: String!, $projectId: String) {
    tasksPendingReview(agentId: $agentId, projectId: $projectId) {
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
          agentId
          agent {
            id
            name
            identityEmoji
          }
        }
      }
      documents {
        id
        title
        type
        createdAt
      }
      messages {
        id
        content
        fromProfileId
        createdAt
        fromProfile {
          id
          displayName
          username
          avatarUrl
        }
      }
    }
  }
`;
