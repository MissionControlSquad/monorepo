import { gql } from "urql";

// Epic #8: task-autonomy reads.
export const PENDING_DECOMPOSITIONS_QUERY = gql`
  query PendingDecompositions($status: String) {
    pendingDecompositions(status: $status) {
      id
      parentTaskId
      status
      plan
      createdAt
    }
  }
`;

export const TASK_TREE_HOLDS_QUERY = gql`
  query TaskTreeHolds {
    taskTreeHolds {
      id
      rootTaskId
      reason
      isActive
      createdAt
    }
  }
`;

export const TASK_RECOVERY_ACTIONS_QUERY = gql`
  query TaskRecoveryActions($limit: Int) {
    taskRecoveryActions(limit: $limit) {
      id
      taskId
      reason
      status
      resolution
      createdAt
    }
  }
`;

// Domain 8 G6.5: typed thread interactions on a task.
export const THREAD_INTERACTIONS_QUERY = gql`
  query ThreadInteractions($taskId: String!, $status: String) {
    threadInteractions(taskId: $taskId, status: $status) {
      id
      kind
      status
      sourceRunId
      payload
      result
      createdAt
      resolvedAt
    }
  }
`;
