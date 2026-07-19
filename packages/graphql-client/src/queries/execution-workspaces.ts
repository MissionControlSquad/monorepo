import { gql } from "urql";

// Tier D / Phase 3 (Plan 3): project workspaces + per-run execution-workspace reads.
export const PROJECT_WORKSPACES_QUERY = gql`
  query ProjectWorkspaces($projectId: String) {
    projectWorkspaces(projectId: $projectId) {
      id
      projectId
      name
      repoUrl
      repoRef
      setupCommand
      cleanupCommand
      defaultStrategy
      isPrimary
    }
  }
`;

export const EXECUTION_WORKSPACES_QUERY = gql`
  query ExecutionWorkspaces($projectId: String, $runId: String) {
    executionWorkspaces(projectId: $projectId, runId: $runId) {
      id
      projectId
      taskId
      runId
      strategyType
      name
      status
      providerType
      createdAt
      operations {
        id
        phase
        command
        exitCode
        status
      }
    }
  }
`;
