import { gql } from "urql";

// Domain 14 #10: Agent-Company reads. Shared across web/desktop/mobile. AGENT_COMPANIES-gated.
export const AGENT_COMPANIES_QUERY = gql`
  query AgentCompanies {
    agentCompanies {
      id
      slug
      name
      description
      goals
      schemaVersion
      license
      createdAt
    }
  }
`;

export const AGENT_COMPANY_QUERY = gql`
  query AgentCompany($id: String!) {
    agentCompany(id: $id) {
      id
      slug
      name
      description
      goals
      schemaVersion
      license
      authors
      sourceRef
    }
  }
`;
