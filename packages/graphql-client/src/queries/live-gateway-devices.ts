import { gql } from "urql";

// GAP-1 / GAP-5: Live Gateway device pairing + agent-key claim read surfaces (admin, LIVE_GATEWAY-gated).
export const LIVE_GATEWAY_DEVICES_QUERY = gql`
  query LiveGatewayDevices($status: String) {
    liveGatewayDevices(status: $status) {
      id
      machineFingerprint
      label
      status
      approvedByProfileId
      approvedAt
      lastSeenAt
      createdAt
    }
  }
`;

export const AGENT_KEY_CLAIMS_QUERY = gql`
  query AgentKeyClaims {
    agentKeyClaims {
      id
      agentId
      label
      status
      expiresAt
      claimedAt
      createdAt
    }
  }
`;
