import { gql } from "urql";

export const ADD_PROJECT_DOC_COMMENT = gql`
  mutation AddProjectDocComment($docId: String!, $body: String!, $quote: String) {
    addProjectDocComment(docId: $docId, body: $body, quote: $quote) {
      id
      body
      resolved
      createdAt
    }
  }
`;
export const RESOLVE_PROJECT_DOC_COMMENT = gql`
  mutation ResolveProjectDocComment($id: String!, $resolved: Boolean!) {
    resolveProjectDocComment(id: $id, resolved: $resolved) {
      id
      resolved
    }
  }
`;
export const DELETE_PROJECT_DOC_COMMENT = gql`
  mutation DeleteProjectDocComment($id: String!) {
    deleteProjectDocComment(id: $id)
  }
`;
