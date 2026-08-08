import { gql } from "urql";

// Human-approved secret proposals (Paperclip #9934 port). Metadata only — never a value.
export const SECRET_PROPOSALS_QUERY = gql`
  query SecretProposals($status: String) {
    secretProposals(status: $status) {
      id
      name
      description
      scope
      requestedByAgentId
      placeholderValue
      status
      decisionReason
      decidedByProfileId
      createdSecretId
      createdAt
      decidedAt
    }
  }
`;
