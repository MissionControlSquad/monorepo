import { gql } from "urql";

// Epic #11: goals mutations.
export const CREATE_GOAL = gql`
  mutation CreateGoal(
    $title: String!
    $level: String
    $status: String
    $parentId: String
    $ownerAgentId: String
  ) {
    createGoal(
      title: $title
      level: $level
      status: $status
      parentId: $parentId
      ownerAgentId: $ownerAgentId
    ) {
      id
    }
  }
`;

export const UPDATE_GOAL = gql`
  mutation UpdateGoal(
    $id: String!
    $title: String
    $status: String
    $level: String
    $parentId: String
    $clearParent: Boolean
    $ownerAgentId: String
    $clearOwner: Boolean
  ) {
    updateGoal(
      id: $id
      title: $title
      status: $status
      level: $level
      parentId: $parentId
      clearParent: $clearParent
      ownerAgentId: $ownerAgentId
      clearOwner: $clearOwner
    ) {
      id
    }
  }
`;

export const DELETE_GOAL = gql`
  mutation DeleteGoal($id: String!) {
    deleteGoal(id: $id)
  }
`;
