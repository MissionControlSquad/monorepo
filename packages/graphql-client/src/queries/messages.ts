import { gql } from "urql";
import { PROFILE_FIELDS, PROFILE_MINIMAL_FIELDS } from "../fragments";

const MESSAGE_FIELDS = `
  id
  taskId
  fromProfileId
  content
  projectId
  createdAt
  fromProfile {
    ${PROFILE_FIELDS}
  }
  task {
    id
    title
    taskNumber
    status
  }
  attachments {
    id
    messageId
    documentId
  }
  mentions {
    id
    messageId
    profileId
    profile {
      ${PROFILE_MINIMAL_FIELDS}
    }
  }
  reactions {
    id
    messageId
    profileId
    emoji
    profile {
      ${PROFILE_MINIMAL_FIELDS}
    }
  }
`;

export const MESSAGES_BY_TASK_QUERY = gql`
  query MessagesByTask($taskId: String!) {
    messagesByTask(taskId: $taskId) {
      ${MESSAGE_FIELDS}
    }
  }
`;

export const MESSAGES_BY_TASK_CONNECTION_QUERY = gql`
  query MessagesByTaskConnection($taskId: String!, $first: Int, $before: String) {
    messagesByTaskConnection(taskId: $taskId, first: $first, before: $before) {
      messages {
        ${MESSAGE_FIELDS}
      }
      hasOlder
    }
  }
`;
