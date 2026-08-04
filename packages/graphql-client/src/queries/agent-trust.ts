import { gql } from "urql";

// Epic #3 — per-agent trust profile (agent-domain governance, GOVERNANCE-gated, admin-editable).
export const AGENT_TRUST_PROFILE_QUERY = gql`
  query AgentTrustProfile($agentId: String!) {
    agentTrustProfile(agentId: $agentId) {
      agentId
      trustLevel
      lowTrustContainment
      requireUntrustedPrReview
      autoPromoteWorkProduct
      sourceTrustBadge
      changeConsentRequired
      executionAllowlist
      updatedAt
    }
  }
`;
