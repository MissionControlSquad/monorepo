import { gql } from "urql";

export const LINK_TASKS = gql`
  mutation LinkTasks($sourceTaskId: String!, $targetTaskId: String!, $type: String!) {
    linkTasks(sourceTaskId: $sourceTaskId, targetTaskId: $targetTaskId, type: $type) {
      id
    }
  }
`;

export const UNLINK_TASKS = gql`
  mutation UnlinkTasks($relationId: String!) {
    unlinkTasks(relationId: $relationId)
  }
`;
