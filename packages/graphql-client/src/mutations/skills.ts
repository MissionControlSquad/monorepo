import { gql } from "urql";

// Epic #10: skills + teams mutations.
export const CREATE_SKILL = gql`
  mutation CreateSkill($name: String!, $markdown: String!) {
    createSkill(name: $name, markdown: $markdown) {
      id
    }
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
