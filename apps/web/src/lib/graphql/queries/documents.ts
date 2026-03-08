import { gql } from "urql";

export const DOCUMENTS_QUERY = gql`
  query Documents($limit: Int) {
    documents(limit: $limit) {
      id
      title
      content
      type
      taskId
      projectId
      createdById
      createdAt
      updatedAt
      createdBy {
        id
        name
        identityEmoji
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

export const DOCUMENT_QUERY = gql`
  query Document($id: String!) {
    document(id: $id) {
      id
      title
      content
      type
      taskId
      projectId
      createdById
      createdAt
      updatedAt
      createdBy {
        id
        name
        identityEmoji
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

export const DOCUMENTS_BY_TASK_QUERY = gql`
  query DocumentsByTask($taskId: String!) {
    documentsByTask(taskId: $taskId) {
      id
      title
      content
      type
      taskId
      projectId
      createdById
      createdAt
      updatedAt
      createdBy {
        id
        name
        identityEmoji
      }
    }
  }
`;

export const DOCUMENTS_BY_TYPE_QUERY = gql`
  query DocumentsByType($type: String!) {
    documentsByType(type: $type) {
      id
      title
      content
      type
      taskId
      projectId
      createdById
      createdAt
      updatedAt
      createdBy {
        id
        name
        identityEmoji
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
