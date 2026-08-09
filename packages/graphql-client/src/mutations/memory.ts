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

// Domain 4 GAP-F: forget a memory entry.
export const FORGET_AGENT_MEMORY = gql`
  mutation ForgetAgentMemory($agentId: String!, $memoryId: String!) {
    forgetAgentMemory(agentId: $agentId, memoryId: $memoryId)
  }
`;
