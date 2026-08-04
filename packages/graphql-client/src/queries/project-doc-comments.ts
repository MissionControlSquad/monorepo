import { gql } from "urql";

// Paperclip parity: review comments on a project doc.
export const PROJECT_DOC_COMMENTS_QUERY = gql`
  query ProjectDocComments($docId: String!) {
    projectDocComments(docId: $docId) {
      id
      body
      quote
      resolved
      authorProfileId
      createdAt
    }
  }
`;
