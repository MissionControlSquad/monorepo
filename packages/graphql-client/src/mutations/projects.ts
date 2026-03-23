import { gql } from "urql";
import { PROFILE_WITH_KIND_FIELDS } from "../fragments";

export const CREATE_PROJECT = gql`
  mutation CreateProject(
    $name: String!
    $description: String
    $memberProfileIds: [String!]
    $memberIds: [String!]
  ) {
    createProject(
      name: $name
      description: $description
      memberProfileIds: $memberProfileIds
      memberIds: $memberIds
    ) {
      id
      name
      description
      status
      createdAt
      updatedAt
      members {
        id
        profileId
        profile {
          ${PROFILE_WITH_KIND_FIELDS}
        }
      }
    }
  }
`;

export const UPDATE_PROJECT = gql`
  mutation UpdateProject($id: String!, $name: String, $description: String, $status: String) {
    updateProject(id: $id, name: $name, description: $description, status: $status) {
      id
      name
      description
      status
      updatedAt
    }
  }
`;

export const ARCHIVE_PROJECT = gql`
  mutation ArchiveProject($id: String!) {
    archiveProject(id: $id) {
      id
      name
      status
      updatedAt
    }
  }
`;

export const RESTORE_PROJECT = gql`
  mutation RestoreProject($id: String!) {
    restoreProject(id: $id) {
      id
      name
      status
      updatedAt
    }
  }
`;

export const ADD_PROJECT_MEMBER = gql`
  mutation AddProjectMember($projectId: String!, $profileId: String, $agentId: String) {
    addProjectMember(projectId: $projectId, profileId: $profileId, agentId: $agentId) {
      id
      projectId
      profileId
      joinedAt
      profile {
        id
        kind
        displayName
        username
        avatarUrl
      }
    }
  }
`;

export const REMOVE_PROJECT_MEMBER = gql`
  mutation RemoveProjectMember($projectId: String!, $profileId: String, $agentId: String) {
    removeProjectMember(projectId: $projectId, profileId: $profileId, agentId: $agentId)
  }
`;
