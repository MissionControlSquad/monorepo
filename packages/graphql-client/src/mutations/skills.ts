import { gql } from "urql";

// Epic #10: skills + teams mutations.
export const CREATE_SKILL = gql`
  mutation CreateSkill(
    $name: String!
    $markdown: String!
    $description: String
    $icon: String
    $color: String
    $tagline: String
    $author: String
    $homepage: String
  ) {
    createSkill(
      name: $name
      markdown: $markdown
      description: $description
      icon: $icon
      color: $color
      tagline: $tagline
      author: $author
      homepage: $homepage
    ) {
      id
    }
  }
`;

export const DELETE_SKILL = gql`
  mutation DeleteSkill($id: String!) {
    deleteSkill(id: $id)
  }
`;

export const FORK_SKILL = gql`
  mutation ForkSkill($id: String!) {
    forkSkill(id: $id) {
      id
    }
  }
`;

export const STAR_SKILL = gql`
  mutation StarSkill($id: String!) {
    starSkill(id: $id)
  }
`;

export const UNSTAR_SKILL = gql`
  mutation UnstarSkill($id: String!) {
    unstarSkill(id: $id)
  }
`;

export const ASSIGN_SKILL = gql`
  mutation AssignSkill($agentId: String!, $skillId: String!) {
    assignSkill(agentId: $agentId, skillId: $skillId) {
      id
    }
  }
`;

export const UNASSIGN_SKILL = gql`
  mutation UnassignSkill($agentId: String!, $skillId: String!) {
    unassignSkill(agentId: $agentId, skillId: $skillId)
  }
`;

export const UPDATE_SKILL = gql`
  mutation UpdateSkill($id: String!, $sharingScope: String) {
    updateSkill(id: $id, sharingScope: $sharingScope) {
      id
      sharingScope
    }
  }
`;

export const INSTALL_CATALOG_SKILL = gql`
  mutation InstallCatalogSkill($skillId: String!) {
    installCatalogSkill(skillId: $skillId) {
      id
      name
    }
  }
`;

export const UPSERT_SKILL_FILE = gql`
  mutation UpsertSkillFile($skillId: String!, $path: String!, $content: String!) {
    upsertSkillFile(skillId: $skillId, path: $path, content: $content) {
      id
      path
      content
      updatedAt
    }
  }
`;

export const DELETE_SKILL_FILE = gql`
  mutation DeleteSkillFile($skillId: String!, $path: String!) {
    deleteSkillFile(skillId: $skillId, path: $path)
  }
`;

export const CREATE_TEAM = gql`
  mutation CreateTeam(
    $name: String!
    $description: String
    $icon: String
    $tagline: String
    $author: String
    $tags: [String!]
  ) {
    createTeam(
      name: $name
      description: $description
      icon: $icon
      tagline: $tagline
      author: $author
      tags: $tags
    ) {
      id
    }
  }
`;

export const ADD_TEAM_MEMBER = gql`
  mutation AddTeamMember($teamId: String!, $name: String!, $role: String!) {
    addTeamMember(teamId: $teamId, name: $name, role: $role) {
      id
    }
  }
`;

export const INSTALL_TEAM = gql`
  mutation InstallTeam($teamId: String!, $collisionStrategy: String) {
    installTeam(teamId: $teamId, collisionStrategy: $collisionStrategy) {
      id
      createdAgentIds
    }
  }
`;
