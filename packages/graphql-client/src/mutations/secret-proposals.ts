import { gql } from "urql";

// Human-approved secret proposals (Paperclip #9934 port). `value` on approve is write-only.
export const CREATE_SECRET_PROPOSAL = gql`
  mutation CreateSecretProposal(
    $name: String!
    $description: String
    $scope: String
    $requestedByAgentId: String
    $placeholderValue: String
  ) {
    createSecretProposal(
      name: $name
      description: $description
      scope: $scope
      requestedByAgentId: $requestedByAgentId
      placeholderValue: $placeholderValue
    ) {
      id
      status
    }
  }
`;

export const APPROVE_SECRET_PROPOSAL = gql`
  mutation ApproveSecretProposal(
    $id: String!
    $value: String!
    $name: String
    $description: String
  ) {
    approveSecretProposal(id: $id, value: $value, name: $name, description: $description) {
      id
      status
      createdSecretId
    }
  }
`;

export const DENY_SECRET_PROPOSAL = gql`
  mutation DenySecretProposal($id: String!, $reason: String!) {
    denySecretProposal(id: $id, reason: $reason) {
      id
      status
      decisionReason
    }
  }
`;
