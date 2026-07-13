import { gql } from "urql";

// Epic #11b: set a project's default goal (tasks created in it inherit it).
export const SET_PROJECT_DEFAULT_GOAL = gql`
  mutation SetProjectDefaultGoal($projectId: String!, $goalId: String) {
    setProjectDefaultGoal(projectId: $projectId, goalId: $goalId) {
      id
      defaultGoalId
    }
  }
`;
