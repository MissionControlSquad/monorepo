import { gql } from "urql";

export const GLOBAL_SEARCH_QUERY = gql`
  query GlobalSearch($searchText: String!, $limit: Int, $projectId: String) {
    globalSearch(searchText: $searchText, limit: $limit, projectId: $projectId) {
      tasks
      messages
      deliverables
    }
  }
`;
