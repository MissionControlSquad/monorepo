import { gql } from "urql";

// Tier C: external object links.
export const TASK_EXTERNAL_LINKS_QUERY = gql`
  query TaskExternalLinks($taskId: String!) {
    taskExternalLinks(taskId: $taskId) {
      id
      kind
      url
      title
    }
  }
`;
