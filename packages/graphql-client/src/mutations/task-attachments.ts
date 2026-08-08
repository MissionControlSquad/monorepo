import { gql } from "urql";

export const PRESIGN_TASK_ATTACHMENT = gql`
  mutation PresignTaskAttachment($taskId: String!, $fileName: String!, $contentType: String!) {
    presignTaskAttachment(taskId: $taskId, fileName: $fileName, contentType: $contentType) {
      attachmentId storageKey uploadUrl
    }
  }
`;
export const CONFIRM_TASK_ATTACHMENT = gql`
  mutation ConfirmTaskAttachment($id: String!, $byteSize: Int) {
    confirmTaskAttachment(id: $id, byteSize: $byteSize) { id fileName status byteSize createdAt }
  }
`;
export const DELETE_TASK_ATTACHMENT = gql`
  mutation DeleteTaskAttachment($id: String!) { deleteTaskAttachment(id: $id) }
`;
