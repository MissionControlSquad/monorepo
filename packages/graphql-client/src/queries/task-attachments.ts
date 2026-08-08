import { gql } from "urql";

export const TASK_ATTACHMENTS_QUERY = gql`
  query TaskAttachments($taskId: String!) {
    taskAttachments(taskId: $taskId) {
      id fileName contentType byteSize status uploadedByProfileId createdAt
    }
  }
`;
export const TASK_ATTACHMENT_DOWNLOAD_URL_QUERY = gql`
  query TaskAttachmentDownloadUrl($id: String!) { taskAttachmentDownloadUrl(id: $id) }
`;
