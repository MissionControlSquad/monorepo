import { gql } from "urql";

// GAP-1 / GAP-5: Live Gateway device pairing + agent-key claim mutations (admin, LIVE_GATEWAY-gated).
export const APPROVE_LIVE_GATEWAY_DEVICE = gql`
  mutation ApproveLiveGatewayDevice($id: String!) {
    approveLiveGatewayDevice(id: $id) {
      id
      status
      approvedAt
      approvedByProfileId
    }
  }
`;

export const REVOKE_LIVE_GATEWAY_DEVICE = gql`
  mutation RevokeLiveGatewayDevice($id: String!) {
    revokeLiveGatewayDevice(id: $id)
  }
`;

// Returns the one-time claimSecret - shown once, never retrievable again.
export const CREATE_AGENT_KEY_CLAIM = gql`
  mutation CreateAgentKeyClaim($agentId: String, $label: String, $ttlMs: Int) {
    createAgentKeyClaim(agentId: $agentId, label: $label, ttlMs: $ttlMs) {
      id
      label
      claimSecret
      expiresAt
    }
  }
`;

// Returns the plaintext agent key - shown once.
export const CLAIM_AGENT_KEY = gql`
  mutation ClaimAgentKey($claimId: String!, $secret: String!) {
    claimAgentKey(claimId: $claimId, secret: $secret) {
      agentKey
      agentId
    }
  }
`;

export const REVOKE_AGENT_KEY_CLAIM = gql`
  mutation RevokeAgentKeyClaim($id: String!) {
    revokeAgentKeyClaim(id: $id)
  }
`;
