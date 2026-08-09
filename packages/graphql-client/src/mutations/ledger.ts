import { gql } from "urql";

// Epic #16: business finance ledger mutations (admin).
export const CREATE_LEDGER_EVENT = gql`
  mutation CreateLedgerEvent(
    $kind: String!
    $category: String
    $categoryId: String
    $biller: String
    $amountCents: Int!
    $currency: String
    $description: String
    $projectId: String
    $occurredAt: DateTime!
  ) {
    createLedgerEvent(
      kind: $kind
      category: $category
      categoryId: $categoryId
      biller: $biller
      amountCents: $amountCents
      currency: $currency
      description: $description
      projectId: $projectId
      occurredAt: $occurredAt
    ) {
      id
    }
  }
`;

export const UPDATE_LEDGER_EVENT = gql`
  mutation UpdateLedgerEvent(
    $id: String!
    $kind: String
    $category: String
    $biller: String
    $amountCents: Int
    $description: String
    $occurredAt: DateTime
  ) {
    updateLedgerEvent(
      id: $id
      kind: $kind
      category: $category
      biller: $biller
      amountCents: $amountCents
      description: $description
      occurredAt: $occurredAt
    ) {
      id
    }
  }
`;

export const DELETE_LEDGER_EVENT = gql`
  mutation DeleteLedgerEvent($id: String!) {
    deleteLedgerEvent(id: $id)
  }
`;

export const CREATE_LEDGER_CATEGORY = gql`
  mutation CreateLedgerCategory($kind: String!, $name: String!) {
    createLedgerCategory(kind: $kind, name: $name) {
      id
    }
  }
`;

export const UPDATE_LEDGER_CATEGORY = gql`
  mutation UpdateLedgerCategory($id: String!, $name: String, $archived: Boolean) {
    updateLedgerCategory(id: $id, name: $name, archived: $archived) {
      id
      archived
    }
  }
`;
