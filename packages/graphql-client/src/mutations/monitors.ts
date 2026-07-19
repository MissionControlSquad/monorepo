import { gql } from "urql";

export const CREATE_MONITOR = gql`
  mutation CreateMonitor($name: String!, $metric: String!, $comparator: String!, $threshold: Int!) {
    createMonitor(name: $name, metric: $metric, comparator: $comparator, threshold: $threshold) {
      id
    }
  }
`;

export const UPDATE_MONITOR = gql`
  mutation UpdateMonitor($id: String!, $name: String, $threshold: Int, $isActive: Boolean) {
    updateMonitor(id: $id, name: $name, threshold: $threshold, isActive: $isActive) {
      id
      isActive
    }
  }
`;

export const DELETE_MONITOR = gql`
  mutation DeleteMonitor($id: String!) {
    deleteMonitor(id: $id)
  }
`;
