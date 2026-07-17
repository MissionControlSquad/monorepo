import { gql } from "urql";

// Tier D: the run ledger — agent executions (sandbox/runner) with captured output.
export const AGENT_RUNS_QUERY = gql`
  query AgentRuns($taskId: String, $agentId: String, $limit: Int) {
    agentRuns(taskId: $taskId, agentId: $agentId, limit: $limit) {
      id
      agentId
      taskId
      kind
      providerKey
      status
      exitCode
      stdout
      stderr
      errorMessage
      startedAt
      finishedAt
    }
  }
`;
