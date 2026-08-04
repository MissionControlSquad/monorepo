import { gql } from "urql";

// Tier D / Domain 4: memory inspect read surfaces. Shared across web/desktop/mobile. MEMORY-gated.

export const MEMORY_OPERATIONS_QUERY = gql`
  query MemoryOperations($agentId: String, $taskId: String, $opType: String, $limit: Int) {
    memoryOperations(agentId: $agentId, taskId: $taskId, opType: $opType, limit: $limit) {
      id
      agentId
      provider
      opType
      taskId
      runId
      sourceKind
      sourceRefId
      success
      error
      latencyMs
      resultCount
      costCents
      attributionMode
      createdAt
    }
  }
`;

export const AGENT_MEMORY_ENTRIES_QUERY = gql`
  query AgentMemoryEntries($agentId: String!, $limit: Int) {
    agentMemoryEntries(agentId: $agentId, limit: $limit) {
      id
      agentId
      content
      sourceTaskId
      sourceKind
      sourceRefId
      createdAt
    }
  }
`;

export const COMPANY_MEMORY_DEFAULT_QUERY = gql`
  query CompanyMemoryDefault {
    companyMemoryDefault
  }
`;

// Domain 4 GAP-F: search an agent's stored memory (recall).
export const SEARCH_AGENT_MEMORY_QUERY = gql`
  query SearchAgentMemory($agentId: String!, $query: String, $limit: Int) {
    searchAgentMemory(agentId: $agentId, query: $query, limit: $limit) {
      id
      content
      sourceTaskId
      sourceKind
      createdAt
    }
  }
`;
