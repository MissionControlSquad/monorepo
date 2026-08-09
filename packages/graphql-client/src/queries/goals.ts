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

// Single goal + hierarchy + linked tasks, for the detail page.
export const GOAL_QUERY = gql`
  query Goal($id: String!) {
    goal(id: $id) {
      id
      title
      description
      level
      status
      parentId
      ownerAgentId
      createdAt
      updatedAt
      ownerAgent {
        id
        name
      }
      parent {
        id
        title
        level
      }
      children {
        id
        title
        level
        status
      }
      tasks {
        id
        title
        taskNumber
        status
      }
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
