import { gql } from "urql";

export const PROJECT_DOCS_BY_PROJECT_QUERY = gql`
  query ProjectDocsByProject($projectId: String!) {
    projectDocsByProject(projectId: $projectId) {
      id
      projectId
      title
      summary
      updatedAt
    }
  }
`;

export const PROJECT_DOC_QUERY = gql`
  query ProjectDoc($id: String!) {
    projectDoc(id: $id) {
      id
      projectId
      title
      summary
      content
      addedById
      createdAt
      updatedAt
      addedBy {
        id
        name
        identityEmoji
      }
    }
  }
`;

export const PROJECT_DOC_REVISIONS_QUERY = gql`
  query ProjectDocRevisions($docId: String!) {
    projectDocRevisions(docId: $docId) {
      id
      docId
      title
      summary
      content
      editedById
      editAction
      createdAt
      editedBy {
        id
        name
        identityEmoji
      }
    }
  }
`;

export const PROJECT_DOC_REVISION_QUERY = gql`
  query ProjectDocRevision($id: String!) {
    projectDocRevision(id: $id) {
      id
      docId
      title
      summary
      content
      editedById
      editAction
      createdAt
      editedBy {
        id
        name
        identityEmoji
      }
    }
  }
`;
