import { gql } from "urql";

// Epic #3: governance queries.
export const APPROVALS_QUERY = gql`
  query Approvals($status: String) {
    approvals(status: $status) {
      id
      title
      subjectType
      subjectId
      status
      reason
      decisionNote
      resubmitCount
      createdAt
      requestedBy {
        id
        displayName
      }
      decidedBy {
        id
        displayName
      }
    }
  }
`;
