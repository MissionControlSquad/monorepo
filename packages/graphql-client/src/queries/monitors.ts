import { gql } from "urql";

// Tier C: monitors with live on-demand evaluation.
export const MONITORS_QUERY = gql`
  query Monitors {
    monitors {
      id
      name
      metric
      comparator
      threshold
      isActive
      value
      breached
    }
  }
`;
