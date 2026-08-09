import { gql } from "urql";

// Epic #14: workspace export + import history.
export const EXPORT_WORKSPACE_BUNDLE = gql`
  query ExportWorkspaceBundle {
    exportWorkspaceBundle
  }
`;

export const WORKSPACE_IMPORTS = gql`
  query WorkspaceImports {
    workspaceImports {
      id
      bundleVersion
      collisionStrategy
      summary
      createdAgentIds
      createdProjectIds
      createdSkillIds
      createdAt
    }
  }
`;
