import { gql } from "urql";

// Tier D: bind an agent to a sandbox provider, and run a task inside a provisioned sandbox.
export const SET_AGENT_SANDBOX_PROVIDER = gql`
  mutation SetAgentSandboxProvider($agentId: String!, $provider: String) {
    setAgentSandboxProvider(agentId: $agentId, provider: $provider) {
      id
      sandboxProvider
    }
  }
`;

export const RUN_TASK_IN_SANDBOX = gql`
  mutation RunTaskInSandbox($taskId: String!, $agentId: String!, $provider: String, $timeoutMs: Int) {
    runTaskInSandbox(taskId: $taskId, agentId: $agentId, provider: $provider, timeoutMs: $timeoutMs) {
      runId
      providerKey
      sandboxId
      exitCode
      stdout
      stderr
      status
    }
  }
`;

// Enqueue a background run (non-blocking) — returns immediately; a worker executes it.
export const ENQUEUE_TASK_IN_SANDBOX = gql`
  mutation EnqueueTaskInSandbox($taskId: String!, $agentId: String!, $provider: String) {
    enqueueTaskInSandbox(taskId: $taskId, agentId: $agentId, provider: $provider) {
      runId
      providerKey
    }
  }
`;

// Cancel a QUEUED run so the worker skips it (a running run can't be cleanly killed in this model).
export const CANCEL_AGENT_RUN = gql`
  mutation CancelAgentRun($runId: String!) {
    cancelAgentRun(runId: $runId)
  }
`;

// Domain 8 G2: board reviewer promotes/requests-changes on a quarantined run's output.
export const PROMOTE_AGENT_RUN_REVIEW = gql`
  mutation PromoteAgentRunReview($runId: String!, $decision: String!) {
    promoteAgentRunReview(runId: $runId, decision: $decision) {
      id
      reviewState
      reviewedByProfileId
      reviewedAt
    }
  }
`;
