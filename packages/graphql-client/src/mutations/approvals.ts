import { gql } from "urql";

// Epic #3: governance mutations.
export const APPROVE_APPROVAL = gql`
  mutation ApproveApproval($id: String!, $decisionNote: String) {
    approveApproval(id: $id, decisionNote: $decisionNote) {
      id
      status
      decisionNote
    }
  }
`;

export const REJECT_APPROVAL = gql`
  mutation RejectApproval($id: String!, $decisionNote: String) {
    rejectApproval(id: $id, decisionNote: $decisionNote) {
      id
      status
      decisionNote
    }
  }
`;

export const REQUEST_APPROVAL_CHANGES = gql`
  mutation RequestApprovalChanges($id: String!, $decisionNote: String) {
    requestApprovalChanges(id: $id, decisionNote: $decisionNote) {
      id
      status
      decisionNote
    }
  }
`;

export const RESUBMIT_APPROVAL = gql`
  mutation ResubmitApproval($id: String!) {
    resubmitApproval(id: $id) {
      id
      status
      resubmitCount
    }
  }
`;

export const CANCEL_APPROVAL = gql`
  mutation CancelApproval($id: String!) {
    cancelApproval(id: $id) {
      id
      status
    }
  }
`;

export const ADD_APPROVAL_COMMENT = gql`
  mutation AddApprovalComment($approvalId: String!, $body: String!) {
    addApprovalComment(approvalId: $approvalId, body: $body) {
      id
      body
      createdAt
      author {
        id
        displayName
      }
    }
  }
`;
