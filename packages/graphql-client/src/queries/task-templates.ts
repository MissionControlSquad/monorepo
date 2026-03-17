import { gql } from "urql";

export const TASK_TEMPLATES_QUERY = gql`
  query TaskTemplates {
    taskTemplates {
      id
      name
      description
      subtasks
      createdAt
      updatedAt
    }
  }
`;

export const TASK_TEMPLATE_QUERY = gql`
  query TaskTemplate($id: String!) {
    taskTemplate(id: $id) {
      id
      name
      description
      subtasks
      createdAt
      updatedAt
    }
  }
`;
