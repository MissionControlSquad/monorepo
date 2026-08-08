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

// Detail read: reuses the workspace-scoped `executionWorkspaces` list resolver (no new server field)
// but requests the full runtime config + phase log; the detail view selects the row by id.
export const EXECUTION_WORKSPACES_DETAIL_QUERY = gql`
  query ExecutionWorkspacesDetail($projectId: String, $runId: String) {
    executionWorkspaces(projectId: $projectId, runId: $runId) {
      id
      projectId
      taskId
      runId
      strategyType
      name
      status
      repoUrl
      branchName
      providerType
      providerRef
      createdAt
      operations {
        id
        phase
        command
        exitCode
        status
        detail
        startedAt
      }
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
