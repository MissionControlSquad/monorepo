import { gql } from "urql";

// Epic #21: agent capability grants + authz audit.
export const AGENT_CAPABILITY_GRANTS_QUERY = gql`
  query AgentCapabilityGrants($agentId: String!) {
    agentCapabilityGrants(agentId: $agentId) {
      id
      capability
      projectScope
      createdAt
    }
  }
`;

export const AGENT_AUTHZ_EVENTS_QUERY = gql`
  query AgentAuthzEvents($agentId: String!) {
    agentAuthzEvents(agentId: $agentId) {
      id
      capability
      decision
      reason
      createdAt
    }
  }
`;
