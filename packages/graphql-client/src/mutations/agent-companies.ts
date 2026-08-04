import { gql } from "urql";

// Domain 14 #10: Agent-Company writes. Shared across web/desktop/mobile. AGENT_COMPANIES-gated, admin.
export const CREATE_AGENT_COMPANY = gql`
  mutation CreateAgentCompany($name: String!, $slug: String, $description: String, $goals: [String!], $license: String) {
    createAgentCompany(name: $name, slug: $slug, description: $description, goals: $goals, license: $license) {
      id
      slug
      name
    }
  }
`;
export const UPDATE_AGENT_COMPANY = gql`
  mutation UpdateAgentCompany($id: String!, $name: String, $description: String, $goals: [String!], $license: String) {
    updateAgentCompany(id: $id, name: $name, description: $description, goals: $goals, license: $license) {
      id
      goals
      description
    }
  }
`;
export const DELETE_AGENT_COMPANY = gql`
  mutation DeleteAgentCompany($id: String!) {
    deleteAgentCompany(id: $id)
  }
`;
export const SET_AGENT_COMPANY = gql`
  mutation SetAgentCompany($agentId: String!, $companyId: String) {
    setAgentCompany(agentId: $agentId, companyId: $companyId) {
      id
      companyId
    }
  }
`;

// Domain 14 #12: import a company markdown package.
export const IMPORT_COMPANY_PACKAGE = gql`
  mutation ImportCompanyPackage($files: JSON!, $sourceRef: String) {
    importCompanyPackage(files: $files, sourceRef: $sourceRef) {
      companyId
      slug
      createdAgentIds
      warnings
    }
  }
`;
