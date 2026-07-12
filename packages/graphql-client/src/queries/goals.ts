import { gql } from "urql";

// Epic #11: goals reads.
export const GOALS_QUERY = gql`
  query Goals {
    goals {
      id
      title
      description
      level
      status
      parentId
      ownerAgentId
      createdAt
    }
  }
`;

export const DEFAULT_GOAL_QUERY = gql`
  query DefaultGoal {
    defaultGoal {
      id
      title
      level
      status
    }
  }
`;
