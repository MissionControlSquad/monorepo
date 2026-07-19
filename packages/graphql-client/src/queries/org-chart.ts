import { gql } from "urql";

// Epic #19: org chart read.
export const ORG_CHART_QUERY = gql`
  query OrgChart {
    orgChart {
      id
      name
      role
      status
      reportsToAgentId
    }
  }
`;
