import { gql } from "urql";
import { PROFILE_FIELDS, PROFILE_WITH_AGENT_FIELDS } from "../fragments";

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
          ${PROFILE_WITH_AGENT_FIELDS}
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
          ${PROFILE_FIELDS}
        }
      }
    }
  }
`;
