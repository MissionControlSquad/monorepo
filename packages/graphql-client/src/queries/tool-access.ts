import { gql } from "urql";

// Parity #21: an agent's effective tool access - workspace-wide + agent-scoped allow/deny rules,
// ordered agent-scoped first then by priority. Read-only; powers the Agent Detail "Tools" tab.
export const AGENT_TOOL_ACCESS_POLICIES_QUERY = gql`
  query AgentToolAccessPolicies($agentId: String!) {
    agentToolAccessPolicies(agentId: $agentId) {
      id
      agentId
      scope
      toolPattern
      effect
      priority
      reason
      createdAt
      updatedAt
    }
  }
`;
