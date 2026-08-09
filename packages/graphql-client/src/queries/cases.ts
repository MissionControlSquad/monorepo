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

// Single case + fields, labels, documents, linked tasks — for the detail page.
export const CASE_QUERY = gql`
  query Case($id: String!) {
    case(id: $id) {
      id
      identifier
      caseNumber
      caseType
      key
      title
      summary
      status
      fields
      parentCaseId
      projectId
      createdAt
      updatedAt
      labels {
        id
        label {
          id
          name
          color
        }
      }
      documents {
        id
        key
        document {
          id
          title
        }
      }
      taskLinks {
        id
        taskId
        role
        task {
          id
          title
          taskNumber
          status
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
