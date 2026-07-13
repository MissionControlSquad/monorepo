import { gql } from "urql";

// Epic #19: set an agent's manager.
export const SET_AGENT_REPORTS_TO = gql`
  mutation SetAgentReportsTo($agentId: String!, $reportsToAgentId: String) {
    setAgentReportsTo(agentId: $agentId, reportsToAgentId: $reportsToAgentId) {
      id
      reportsToAgentId
    }
  }
`;
