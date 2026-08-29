import { gql } from "urql";

// Rule-based approval policies (GOVERNANCE). member+ may view, admin manages. Workspace-scoped.
export const APPROVAL_POLICIES_QUERY = gql`
  query ApprovalPolicies {
    approvalPolicies {
      id
      name
      priority
      action
      effect
      enabled
      subject
      condition
      createdAt
      updatedAt
    }
  }
`;
