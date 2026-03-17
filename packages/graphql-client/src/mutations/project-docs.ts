import { gql } from "urql";

export const CREATE_PROJECT_DOC = gql`
  mutation CreateProjectDoc(
    $projectId: String!
    $title: String!
    $content: String!
    $summary: String
    $addedById: String
  ) {
    createProjectDoc(
      projectId: $projectId
      title: $title
      content: $content
      summary: $summary
      addedById: $addedById
    ) {
      id
      projectId
      title
      summary
      content
      addedById
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_PROJECT_DOC = gql`
  mutation UpdateProjectDoc(
    $id: String!
    $title: String
    $content: String
    $summary: String
    $editedById: String
  ) {
    updateProjectDoc(
      id: $id
      title: $title
      content: $content
      summary: $summary
      editedById: $editedById
    ) {
      id
      projectId
      title
      summary
      content
      updatedAt
    }
  }
`;

export const DELETE_PROJECT_DOC = gql`
  mutation DeleteProjectDoc($id: String!, $editedById: String) {
    deleteProjectDoc(id: $id, editedById: $editedById)
  }
`;
