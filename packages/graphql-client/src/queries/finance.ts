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
      projectId
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

// Domain 12 GAP-6 A14: metered vs subscription vs other spend split.
export const COST_BILLING_SPLIT_QUERY = gql`
  query CostBillingSplit($from: DateTime, $to: DateTime) {
    costBillingSplit(from: $from, to: $to) {
      meteredCents
      subscriptionCents
      otherCents
      meteredCount
      subscriptionCount
      otherCount
    }
  }
`;

// Domain 12 GAP-6 A12: recursive issue-tree cost + runtime rollup.
export const COST_BY_TASK_TREE_QUERY = gql`
  query CostByTaskTree($rootTaskId: String!, $excludeRoot: Boolean) {
    costByTaskTree(rootTaskId: $rootTaskId, excludeRoot: $excludeRoot) {
      rootTaskId
      taskCount
      costCents
      eventCount
      runCount
      runtimeSeconds
    }
  }
`;

// Domain 12 GAP-6 A10: rolling per-provider spend windows (5h/24h/7d).
export const COST_WINDOW_SPEND_QUERY = gql`
  query CostWindowSpend {
    costWindowSpend {
      provider
      window
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

// Domain 14 #18: an agent's token salary policy.
export const AGENT_SALARY_QUERY = gql`
  query AgentSalary($agentId: String!) {
    agentSalary(agentId: $agentId) {
      id
      limitCents
      window
      isSalary
    }
  }
`;

// Domain 12 GAP-2: live provider quota / rate-limit windows (admin, PROVIDER_QUOTA-gated).
export const PROVIDER_QUOTA_WINDOWS_QUERY = gql`
  query ProviderQuotaWindows {
    providerQuotaWindows {
      provider
      ok
      errorFamily
      error
      windows {
        label
        usedPercent
        resetsAt
        valueLabel
        detail
      }
    }
  }
`;

// Domain 12 A13: cost events awaiting a price correction (drill-down for repriceCostEvent).
export const UNPRICED_COST_EVENTS_QUERY = gql`
  query UnpricedCostEvents($limit: Int) {
    unpricedCostEvents(limit: $limit) {
      id
      model
      provider
      tokensIn
      tokensOut
      amountCents
      billingType
      occurredAt
    }
  }
`;
