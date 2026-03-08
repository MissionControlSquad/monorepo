import { gql } from "urql";

export const CREATE_TASK_TEMPLATE = gql`
  mutation CreateTaskTemplate($name: String!, $description: String, $subtasks: String!) {
    createTaskTemplate(name: $name, description: $description, subtasks: $subtasks) {
      id
      name
      description
      subtasks
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_TASK_TEMPLATE = gql`
  mutation UpdateTaskTemplate(
    $id: String!
    $name: String
    $description: String
    $subtasks: String
  ) {
    updateTaskTemplate(id: $id, name: $name, description: $description, subtasks: $subtasks) {
      id
      name
      description
      subtasks
      updatedAt
    }
  }
`;

export const DELETE_TASK_TEMPLATE = gql`
  mutation DeleteTaskTemplate($id: String!) {
    deleteTaskTemplate(id: $id)
  }
`;

export const SAVE_TASK_AS_TEMPLATE = gql`
  mutation SaveTaskAsTemplate($taskId: String!) {
    saveTaskAsTemplate(taskId: $taskId) {
      id
      name
      description
      subtasks
      createdAt
    }
  }
`;

export const INSTANTIATE_TEMPLATE = gql`
  mutation InstantiateTemplate(
    $templateId: String!
    $titleOverride: String
    $priority: String
    $assigneeIds: [String!]
    $dueDate: String
    $tags: [String!]
    $projectId: String
  ) {
    instantiateTemplate(
      templateId: $templateId
      titleOverride: $titleOverride
      priority: $priority
      assigneeIds: $assigneeIds
      dueDate: $dueDate
      tags: $tags
      projectId: $projectId
    )
  }
`;
