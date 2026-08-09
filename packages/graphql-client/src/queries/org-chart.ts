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

// Domain 14 #16: server-rendered org-chart SVG for sharing/embedding.
export const ORG_CHART_SVG_QUERY = gql`
  query OrgChartSvg {
    orgChartSvg
  }
`;
