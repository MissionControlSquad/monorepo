import { gql } from "urql";

// Tier D: run a raw shell command on a cloud VM via server-side SSH.
export const RUN_COMMAND_ON_VM = gql`
  mutation RunCommandOnVm($vmId: String!, $command: String!, $cwd: String, $timeoutMs: Int) {
    runCommandOnVm(vmId: $vmId, command: $command, cwd: $cwd, timeoutMs: $timeoutMs) {
      id
      status
      exitCode
      stdout
      stderr
      errorMessage
      finishedAt
      createdAt
    }
  }
`;

export const CANCEL_RUNNER_COMMAND = gql`
  mutation CancelRunnerCommand($id: String!) {
    cancelRunnerCommand(id: $id)
  }
`;

// Queue a raw command for an agent's runner daemon to pull (outbound-only / NAT-safe targets).
export const QUEUE_AGENT_COMMAND = gql`
  mutation QueueAgentCommand($agentId: String!, $command: String!, $cwd: String, $timeoutMs: Int) {
    queueAgentCommand(agentId: $agentId, command: $command, cwd: $cwd, timeoutMs: $timeoutMs) {
      id
      status
      command
      createdAt
    }
  }
`;
