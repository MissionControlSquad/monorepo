import { gql } from "urql";

// Domain 8 G1: work products for a task (output-type deliverables). Shared across web/desktop/mobile.
export const WORK_PRODUCTS_BY_TASK_QUERY = gql`
  query WorkProductsByTask($taskId: String!) {
    workProductsByTask(taskId: $taskId) {
      id
      kind
      title
      url
      provider
      externalId
      reviewState
      outputStatus
      healthStatus
      isPrimary
      createdByRunId
      createdAt
    }
  }
`;
