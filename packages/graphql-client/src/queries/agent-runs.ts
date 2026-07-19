import { gql } from "urql";

// Tier D / Phase 3 (Plan 6): the redacted live tail + phase of a run mid-flight (poll while running).
export const AGENT_RUN_LIVE_STATUS_QUERY = gql`
  query AgentRunLiveStatus($runId: String!) {
    agentRunLiveStatus(runId: $runId) {
      phase
      tail
    }
  }
`;

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
