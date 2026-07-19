import { gql } from "urql";

// Tier D / Domain 4: memory binding mutations. Shared across web/desktop/mobile. MEMORY-gated, admin.

export const SET_AGENT_MEMORY_PROVIDER = gql`
  mutation SetAgentMemoryProvider($agentId: String!, $provider: String!) {
    setAgentMemoryProvider(agentId: $agentId, provider: $provider) {
      id
      memoryProvider
    }
  }
`;

export const SET_COMPANY_MEMORY_PROVIDER = gql`
  mutation SetCompanyMemoryProvider($provider: String!) {
    setCompanyMemoryProvider(provider: $provider)
  }
`;
