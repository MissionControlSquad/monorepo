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
