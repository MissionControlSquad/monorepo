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

// Full-page search — workspace-scoped, six scopes.
export const SEARCH_ALL_QUERY = gql`
  query SearchAll($searchText: String!, $limit: Int) {
    searchAll(searchText: $searchText, limit: $limit) {
      tasks
      messages
      deliverables
      agents
      projects
      goals
    }
  }
`;
