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
