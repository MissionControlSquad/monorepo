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

// Single approval + its comment thread + linked task, for the detail page.
export const APPROVAL_QUERY = gql`
  query Approval($id: String!) {
    approval(id: $id) {
      id
      title
      subjectType
      subjectId
      taskId
      status
      reason
      decisionNote
      resubmitCount
      createdAt
      decidedAt
      requestedBy {
        id
        displayName
      }
      decidedBy {
        id
        displayName
      }
      task {
        id
        title
        taskNumber
        status
      }
      comments {
        id
        body
        createdAt
        author {
          id
          displayName
        }
      }
    }
  }
`;
