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
