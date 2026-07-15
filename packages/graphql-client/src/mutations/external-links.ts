import { gql } from "urql";

export const ADD_EXTERNAL_LINK = gql`
  mutation AddExternalLink($taskId: String!, $url: String!, $title: String) {
    addExternalLink(taskId: $taskId, url: $url, title: $title) {
      id
    }
  }
`;

export const REMOVE_EXTERNAL_LINK = gql`
  mutation RemoveExternalLink($id: String!) {
    removeExternalLink(id: $id)
  }
`;
