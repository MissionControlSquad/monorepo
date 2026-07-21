import { gql } from "urql";

// Set a per-agent trust profile (GOVERNANCE-gated, admin-only). All fields optional — only the
// provided ones are updated. Wires the previously-unreachable setAgentTrustProfile mutation.
export const SET_AGENT_TRUST_PROFILE = gql`
  mutation SetAgentTrustProfile(
    $agentId: String!
    $trustLevel: String
    $lowTrustContainment: Boolean
    $requireUntrustedPrReview: Boolean
    $autoPromoteWorkProduct: Boolean
    $sourceTrustBadge: String
    $changeConsentRequired: Boolean
    $executionAllowlist: [String!]
  ) {
    setAgentTrustProfile(
      agentId: $agentId
      trustLevel: $trustLevel
      lowTrustContainment: $lowTrustContainment
      requireUntrustedPrReview: $requireUntrustedPrReview
      autoPromoteWorkProduct: $autoPromoteWorkProduct
      sourceTrustBadge: $sourceTrustBadge
      changeConsentRequired: $changeConsentRequired
      executionAllowlist: $executionAllowlist
    ) {
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
