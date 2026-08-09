import { gql } from "urql";

// Tier D: runner commands (raw shell/CLI jobs on a runner).
export const RUNNER_COMMANDS_QUERY = gql`
  query RunnerCommands($targetKind: String, $targetId: String, $limit: Int) {
    runnerCommands(targetKind: $targetKind, targetId: $targetId, limit: $limit) {
      id
      targetKind
      targetId
      command
      cwd
      status
      exitCode
      stdout
      stderr
      errorMessage
      startedAt
      finishedAt
      createdAt
    }
  }
`;
