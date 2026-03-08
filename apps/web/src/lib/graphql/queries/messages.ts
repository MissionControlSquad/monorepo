import { gql } from "urql";

export const MESSAGES_BY_TASK_QUERY = gql`
  query MessagesByTask($taskId: String!) {
    messagesByTask(taskId: $taskId) {
      id
      taskId
      fromProfileId
      content
      projectId
      createdAt
      fromProfile {
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
          id
          displayName
          username
        }
      }
      reactions {
        id
        messageId
        profileId
        emoji
        profile {
          id
          displayName
          username
        }
      }
    }
  }
`;

export const MESSAGES_BY_TASK_CONNECTION_QUERY = gql`
  query MessagesByTaskConnection($taskId: String!, $first: Int, $before: String) {
    messagesByTaskConnection(taskId: $taskId, first: $first, before: $before) {
      messages {
        id
        taskId
        fromProfileId
        content
        projectId
        createdAt
        fromProfile {
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
            id
            displayName
            username
          }
        }
        reactions {
          id
          messageId
          profileId
          emoji
          profile {
            id
            displayName
            username
          }
        }
      }
      hasOlder
    }
  }
`;
