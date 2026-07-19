import { gql } from "urql";

// Epic #8: task-autonomy mutations (admin review gate).
export const REVIEW_DECOMPOSITION = gql`
  mutation ReviewDecomposition($id: String!, $decision: String!) {
    reviewDecomposition(id: $id, decision: $decision) {
      id
      status
    }
  }
`;

export const APPLY_DECOMPOSITION = gql`
  mutation ApplyDecomposition($id: String!) {
    applyDecomposition(id: $id)
  }
`;

export const RELEASE_SUBTREE_HOLD = gql`
  mutation ReleaseSubtreeHold($rootTaskId: String!) {
    releaseSubtreeHold(rootTaskId: $rootTaskId)
  }
`;

export const EVALUATE_WATCHDOGS_NOW = gql`
  mutation EvaluateWatchdogsNow {
    evaluateWatchdogsNow
  }
`;
