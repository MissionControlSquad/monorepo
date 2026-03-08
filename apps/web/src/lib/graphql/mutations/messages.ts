import { gql } from "urql";

export const CREATE_MESSAGE = gql`
  mutation CreateMessage(
    $taskId: String!
    $fromProfileId: String!
    $content: String!
    $attachmentIds: [String!]
  ) {
    createMessage(
      taskId: $taskId
      fromProfileId: $fromProfileId
      content: $content
      attachmentIds: $attachmentIds
    ) {
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
      attachments {
        id
        documentId
      }
      mentions {
        id
        profileId
      }
    }
  }
`;
