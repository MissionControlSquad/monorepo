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
