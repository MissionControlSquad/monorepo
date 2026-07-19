import { gql } from "urql";

const PW_FIELDS = `
  id
  projectId
  name
  repoUrl
  repoRef
  setupCommand
  cleanupCommand
  defaultStrategy
  isPrimary
`;

export const CREATE_PROJECT_WORKSPACE = gql`
  mutation CreateProjectWorkspace(
    $projectId: String!
    $name: String!
    $repoUrl: String
    $repoRef: String
    $setupCommand: String
    $cleanupCommand: String
    $defaultStrategy: String
    $isPrimary: Boolean
  ) {
    createProjectWorkspace(
      projectId: $projectId
      name: $name
      repoUrl: $repoUrl
      repoRef: $repoRef
      setupCommand: $setupCommand
      cleanupCommand: $cleanupCommand
      defaultStrategy: $defaultStrategy
      isPrimary: $isPrimary
    ) { ${PW_FIELDS} }
  }
`;

export const UPDATE_PROJECT_WORKSPACE = gql`
  mutation UpdateProjectWorkspace(
    $id: String!
    $name: String
    $repoUrl: String
    $repoRef: String
    $setupCommand: String
    $cleanupCommand: String
    $defaultStrategy: String
    $isPrimary: Boolean
  ) {
    updateProjectWorkspace(
      id: $id
      name: $name
      repoUrl: $repoUrl
      repoRef: $repoRef
      setupCommand: $setupCommand
      cleanupCommand: $cleanupCommand
      defaultStrategy: $defaultStrategy
      isPrimary: $isPrimary
    ) { ${PW_FIELDS} }
  }
`;

export const DELETE_PROJECT_WORKSPACE = gql`
  mutation DeleteProjectWorkspace($id: String!) {
    deleteProjectWorkspace(id: $id)
  }
`;
