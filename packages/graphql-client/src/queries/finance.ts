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
