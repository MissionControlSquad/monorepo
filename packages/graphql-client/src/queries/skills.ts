import { gql } from "urql";

// Epic #10: skills + teams reads.
export const SKILLS_QUERY = gql`
  query Skills {
    skills {
      id
      name
      key
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
      installCount
      members {
        id
        name
        role
      }
    }
  }
`;
