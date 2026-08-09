import { gql } from "urql";

// Epic #21: agent capability grant mutations.
export const GRANT_AGENT_CAPABILITY = gql`
  mutation GrantAgentCapability($agentId: String!, $capability: String!, $projectScope: String) {
    grantAgentCapability(agentId: $agentId, capability: $capability, projectScope: $projectScope) {
      id
      capability
    }
  }
`;

export const REVOKE_AGENT_CAPABILITY = gql`
  mutation RevokeAgentCapability($grantId: String!) {
    revokeAgentCapability(grantId: $grantId)
  }
`;
