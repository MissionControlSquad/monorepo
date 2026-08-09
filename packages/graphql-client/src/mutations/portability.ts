import { gql } from "urql";

// Epic #14: import a portable bundle into the caller's workspace (admin).
export const IMPORT_WORKSPACE_BUNDLE = gql`
  mutation ImportWorkspaceBundle($bundle: JSON!, $collisionStrategy: String) {
    importWorkspaceBundle(bundle: $bundle, collisionStrategy: $collisionStrategy) {
      id
      summary
      createdAgentIds
      createdProjectIds
      createdSkillIds
    }
  }
`;
