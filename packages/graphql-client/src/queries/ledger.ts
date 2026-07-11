import { gql } from "urql";

// Epic #16: business finance ledger read queries.
export const LEDGER_SUMMARY_QUERY = gql`
  query LedgerSummary($from: DateTime, $to: DateTime) {
    ledgerSummary(from: $from, to: $to) {
      revenueCents
      expenseCents
      netCents
      currency
      eventCount
    }
  }
`;

export const LEDGER_BY_CATEGORY_QUERY = gql`
  query LedgerByCategory($from: DateTime, $to: DateTime) {
    ledgerByCategory(from: $from, to: $to) {
      category
      kind
      totalCents
      eventCount
    }
  }
`;

export const LEDGER_TIMELINE_QUERY = gql`
  query LedgerTimeline($from: DateTime, $to: DateTime, $bucket: String) {
    ledgerTimeline(from: $from, to: $to, bucket: $bucket) {
      bucketStart
      revenueCents
      expenseCents
      netCents
    }
  }
`;

export const LEDGER_EVENTS_QUERY = gql`
  query LedgerEvents(
    $from: DateTime
    $to: DateTime
    $kind: String
    $biller: String
    $projectId: String
    $limit: Int
    $cursor: String
  ) {
    ledgerEvents(
      from: $from
      to: $to
      kind: $kind
      biller: $biller
      projectId: $projectId
      limit: $limit
      cursor: $cursor
    ) {
      events {
        id
        kind
        category
        biller
        amountCents
        currency
        description
        occurredAt
      }
      nextCursor
    }
  }
`;

export const LEDGER_CATEGORIES_QUERY = gql`
  query LedgerCategories($kind: String, $includeArchived: Boolean) {
    ledgerCategories(kind: $kind, includeArchived: $includeArchived) {
      id
      kind
      name
      archived
    }
  }
`;
