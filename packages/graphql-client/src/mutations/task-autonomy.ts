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

// Domain 9 #11: arm / clear a one-shot "check back later" task monitor.
export const ARM_TASK_MONITOR = gql`
  mutation ArmTaskMonitor($taskId: String!, $nextCheckAt: DateTime!, $notes: String, $maxAttempts: Int) {
    armTaskMonitor(taskId: $taskId, nextCheckAt: $nextCheckAt, notes: $notes, maxAttempts: $maxAttempts) {
      id
      monitorNextCheckAt
      monitorNotes
      monitorAttemptCount
      monitorMaxAttempts
    }
  }
`;

export const CLEAR_TASK_MONITOR = gql`
  mutation ClearTaskMonitor($taskId: String!) {
    clearTaskMonitor(taskId: $taskId)
  }
`;
