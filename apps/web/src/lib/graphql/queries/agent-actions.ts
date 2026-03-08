import { gql } from "urql";

export const AGENT_ACTIONS_BY_AGENT_QUERY = gql`
  query AgentActionsByAgent($agentId: String!, $limit: Int, $projectId: String) {
    agentActionsByAgent(agentId: $agentId, limit: $limit, projectId: $projectId) {
      id
      agentId
      taskId
      projectId
      actionType
      description
      metadata
      timestamp
      agent {
        id
        name
        identityEmoji
      }
      task {
        id
        title
        taskNumber
        status
      }
    }
  }
`;
