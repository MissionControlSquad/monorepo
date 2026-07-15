import { gql } from "urql";

// Epic A.4: workspace agent governance.
export const AGENT_GOVERNANCE_QUERY = gql`
  query AgentGovernance {
    agentGovernance {
      requireAgentApproval
    }
  }
`;
