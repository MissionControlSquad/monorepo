import { gql } from "urql";

// Epic #10: skills + teams reads.
export const SKILLS_QUERY = gql`
  query Skills {
    skills {
      id
      name
      key
      description
      icon
      color
      tagline
      author
      homepage
      currentVersion
      starCount
      installCount
      forkCount
      trustLevel
      forkedFromSkillId
    }
  }
`;

export const TEAMS_QUERY = gql`
  query Teams {
    teams {
      id
      name
      key
      description
      icon
      tagline
      author
      tags
      kind
      trustLevel
      installCount
      members {
        id
        name
        role
      }
    }
  }
`;

export const PREVIEW_TEAM_INSTALL_QUERY = gql`
  query PreviewTeamInstall($teamId: String!, $collisionStrategy: String) {
    previewTeamInstall(teamId: $teamId, collisionStrategy: $collisionStrategy) {
      member
      action
      agentName
    }
  }
`;
