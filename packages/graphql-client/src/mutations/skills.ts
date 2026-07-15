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

export const CREATE_TEAM = gql`
  mutation CreateTeam($name: String!) {
    createTeam(name: $name) {
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
