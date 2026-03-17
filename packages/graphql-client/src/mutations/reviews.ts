import { gql } from "urql";

export const APPROVE_TASK = gql`
  mutation ApproveTask(
    $reviewerId: String!
    $taskId: String!
    $approvalComment: String
    $childTasks: String
  ) {
    approveTask(
      reviewerId: $reviewerId
      taskId: $taskId
      approvalComment: $approvalComment
      childTasks: $childTasks
    ) {
      success
      message
      newStatus
      childTaskIds
    }
  }
`;

export const REJECT_TASK = gql`
  mutation RejectTask(
    $reviewerId: String!
    $taskId: String!
    $rejectionReason: String!
    $changesNeeded: [String!]!
  ) {
    rejectTask(
      reviewerId: $reviewerId
      taskId: $taskId
      rejectionReason: $rejectionReason
      changesNeeded: $changesNeeded
    ) {
      success
      message
      newStatus
      childTaskIds
    }
  }
`;

export const REQUEST_CLARIFICATION = gql`
  mutation RequestClarification($reviewerId: String!, $taskId: String!, $questions: [String!]!) {
    requestClarification(reviewerId: $reviewerId, taskId: $taskId, questions: $questions) {
      success
      message
      newStatus
      childTaskIds
    }
  }
`;
