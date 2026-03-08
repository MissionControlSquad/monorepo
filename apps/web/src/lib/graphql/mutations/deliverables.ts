import { gql } from "urql";

export const SUBMIT_DELIVERABLE = gql`
  mutation SubmitDeliverable(
    $taskId: String!
    $agentId: String!
    $title: String!
    $kind: String!
    $content: String
    $language: String
    $storageKey: String
    $fileName: String
    $mimeType: String
    $fileSize: Int
    $url: String
  ) {
    submitDeliverable(
      taskId: $taskId
      agentId: $agentId
      title: $title
      kind: $kind
      content: $content
      language: $language
      storageKey: $storageKey
      fileName: $fileName
      mimeType: $mimeType
      fileSize: $fileSize
      url: $url
    ) {
      id
      taskId
      profileId
      projectId
      title
      kind
      content
      language
      storageKey
      fileName
      mimeType
      fileSize
      url
      createdAt
    }
  }
`;

export const DELETE_DELIVERABLE = gql`
  mutation DeleteDeliverable($id: String!) {
    deleteDeliverable(id: $id)
  }
`;
