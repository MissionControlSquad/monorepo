import { gql } from "urql";

export const LOG_AGENT_ACTION = gql`
  mutation LogAgentAction(
    $agentId: String!
    $actionType: String!
    $description: String!
    $taskId: String
    $metadata: String
  ) {
    logAgentAction(
      agentId: $agentId
      actionType: $actionType
      description: $description
      taskId: $taskId
      metadata: $metadata
    ) {
      id
      agentId
      taskId
      projectId
      actionType
      description
      metadata
      timestamp
    }
  }
`;
