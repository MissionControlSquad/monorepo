import { gql } from "urql";

// Epic #17: cases reads.
export const CASES_QUERY = gql`
  query Cases($status: String) {
    cases(status: $status) {
      id
      identifier
      title
      caseType
      status
      labels {
        id
        label {
          id
          name
          color
        }
      }
    }
  }
`;

export const LABELS_QUERY = gql`
  query Labels {
    labels {
      id
      name
      color
    }
  }
`;

export const CASE_EVENTS_QUERY = gql`
  query CaseEvents($caseId: String!, $limit: Int) {
    caseEvents(caseId: $caseId, limit: $limit) {
      id
      kind
      actorType
      createdAt
    }
  }
`;
