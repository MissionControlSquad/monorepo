import { gql } from "urql";

// Epic #17: cases mutations.
export const CREATE_CASE = gql`
  mutation CreateCase($title: String!, $caseType: String!, $summary: String) {
    createCase(title: $title, caseType: $caseType, summary: $summary) {
      id
    }
  }
`;

export const SET_CASE_STATUS = gql`
  mutation SetCaseStatus($id: String!, $status: String!) {
    setCaseStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

export const CREATE_LABEL = gql`
  mutation CreateLabel($name: String!, $color: String) {
    createLabel(name: $name, color: $color) {
      id
    }
  }
`;

export const ADD_CASE_LABEL = gql`
  mutation AddCaseLabel($caseId: String!, $labelId: String!) {
    addCaseLabel(caseId: $caseId, labelId: $labelId)
  }
`;

export const REMOVE_CASE_LABEL = gql`
  mutation RemoveCaseLabel($caseId: String!, $labelId: String!) {
    removeCaseLabel(caseId: $caseId, labelId: $labelId)
  }
`;

export const LINK_TASK_TO_CASE = gql`
  mutation LinkTaskToCase($caseId: String!, $taskId: String!, $role: String) {
    linkTaskToCase(caseId: $caseId, taskId: $taskId, role: $role) {
      id
    }
  }
`;

export const UPDATE_CASE = gql`
  mutation UpdateCase($id: String!, $title: String, $summary: String, $caseType: String, $fields: JSON) {
    updateCase(id: $id, title: $title, summary: $summary, caseType: $caseType, fields: $fields) {
      id
      title
      summary
      caseType
      fields
    }
  }
`;

export const UNLINK_TASK_FROM_CASE = gql`
  mutation UnlinkTaskFromCase($caseId: String!, $taskId: String!) {
    unlinkTaskFromCase(caseId: $caseId, taskId: $taskId)
  }
`;
