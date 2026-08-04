import { gql } from "urql";

// Tier C: typed task dependency graph.
export const TASK_RELATIONS_QUERY = gql`
  query TaskRelations($taskId: String!) {
    taskRelations(taskId: $taskId) {
      id
      type
      sourceTaskId
      targetTaskId
      sourceTask {
        id
        title
        taskNumber
        status
      }
      targetTask {
        id
        title
        taskNumber
        status
      }
    }
  }
`;

// Domain 8 G6.1: "Why is this blocked?" readiness diagnostics.
export const BLOCKER_DIAGNOSTICS_QUERY = gql`
  query BlockerDiagnostics($taskId: String!) {
    blockerDiagnostics(taskId: $taskId) {
      readiness
      unresolvedCount
      reasons
      blockers {
        taskId
        status
        source
        resolved
      }
    }
  }
`;
