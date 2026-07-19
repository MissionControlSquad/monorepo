import { gql } from "urql";

// Epic #4: budgets / cost read queries.
export const FINANCE_SUMMARY_QUERY = gql`
  query FinanceSummary($window: String) {
    financeSummary(window: $window) {
      totalSpendCents
      windowSpendCents
      activePolicies
      openIncidents
    }
  }
`;

export const BUDGET_POLICIES_QUERY = gql`
  query BudgetPolicies {
    budgetPolicies {
      id
      scope
      agentId
      name
      limitCents
      window
      hardStop
      warnPercent
      isActive
      createdAt
    }
  }
`;

export const BUDGET_INCIDENTS_QUERY = gql`
  query BudgetIncidents($status: String) {
    budgetIncidents(status: $status) {
      id
      policyId
      agentId
      status
      thresholdType
      spendCents
      limitCents
      autoPaused
      approvalId
      detail
      resolvedById
      resolvedAt
      createdAt
    }
  }
`;

export const COST_TREND_QUERY = gql`
  query CostTrend($days: Int, $projectId: String) {
    costTrend(days: $days, projectId: $projectId) {
      date
      amountCents
    }
  }
`;

export const COST_BREAKDOWN_QUERY = gql`
  query CostBreakdown($groupBy: String!, $from: DateTime, $to: DateTime, $projectId: String) {
    costBreakdown(groupBy: $groupBy, from: $from, to: $to, projectId: $projectId) {
      key
      label
      amountCents
      eventCount
    }
  }
`;

// Domain 12 GAP-1: non-inference finance ledger read surfaces.
export const FINANCE_EVENT_SUMMARY_QUERY = gql`
  query FinanceEventSummary($since: DateTime, $until: DateTime) {
    financeEventSummary(since: $since, until: $until) {
      debitCents
      creditCents
      netCents
      estimatedCents
      count
    }
  }
`;

export const FINANCE_EVENTS_BY_BILLER_QUERY = gql`
  query FinanceEventsByBiller($since: DateTime, $until: DateTime) {
    financeEventsByBiller(since: $since, until: $until) {
      key
      debitCents
      creditCents
      netCents
      count
    }
  }
`;

export const FINANCE_EVENTS_BY_KIND_QUERY = gql`
  query FinanceEventsByKind($since: DateTime, $until: DateTime) {
    financeEventsByKind(since: $since, until: $until) {
      key
      debitCents
      creditCents
      netCents
      count
    }
  }
`;

export const FINANCE_EVENTS_QUERY = gql`
  query FinanceEvents($limit: Int) {
    financeEvents(limit: $limit) {
      id
      eventKind
      direction
      biller
      provider
      description
      amountCents
      currency
      estimated
      occurredAt
    }
  }
`;
