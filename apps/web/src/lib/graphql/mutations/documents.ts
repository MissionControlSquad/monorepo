import { gql } from "urql";

export const CREATE_DOCUMENT = gql`
  mutation CreateDocument(
    $title: String!
    $content: String!
    $type: String!
    $taskId: String
    $createdById: String!
  ) {
    createDocument(
      title: $title
      content: $content
      type: $type
      taskId: $taskId
      createdById: $createdById
    ) {
      id
      title
      content
      type
      taskId
      projectId
      createdById
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_DOCUMENT = gql`
  mutation UpdateDocument($id: String!, $title: String, $content: String) {
    updateDocument(id: $id, title: $title, content: $content) {
      id
      title
      content
      type
      taskId
      projectId
      createdById
      updatedAt
    }
  }
`;

export const DELETE_DOCUMENT = gql`
  mutation DeleteDocument($id: String!) {
    deleteDocument(id: $id)
  }
`;
