import { gql } from "urql";

// Epic #4: budget policy + incident mutations (admin).
export const CREATE_BUDGET_POLICY = gql`
  mutation CreateBudgetPolicy(
    $scope: String!
    $agentId: String
    $name: String!
    $limitCents: Int!
    $window: String!
    $hardStop: Boolean
    $warnPercent: Int
  ) {
    createBudgetPolicy(
      scope: $scope
      agentId: $agentId
      name: $name
      limitCents: $limitCents
      window: $window
      hardStop: $hardStop
      warnPercent: $warnPercent
    ) {
      id
    }
  }
`;

export const UPDATE_BUDGET_POLICY = gql`
  mutation UpdateBudgetPolicy(
    $id: String!
    $name: String
    $limitCents: Int
    $window: String
    $hardStop: Boolean
    $isActive: Boolean
  ) {
    updateBudgetPolicy(
      id: $id
      name: $name
      limitCents: $limitCents
      window: $window
      hardStop: $hardStop
      isActive: $isActive
    ) {
      id
      isActive
    }
  }
`;

export const DELETE_BUDGET_POLICY = gql`
  mutation DeleteBudgetPolicy($id: String!) {
    deleteBudgetPolicy(id: $id)
  }
`;

export const RESOLVE_BUDGET_INCIDENT = gql`
  mutation ResolveBudgetIncident($id: String!, $detail: String) {
    resolveBudgetIncident(id: $id, detail: $detail) {
      id
      status
    }
  }
`;

export const RAISE_BUDGET_AND_RESUME = gql`
  mutation RaiseBudgetAndResume($id: String!, $newLimitCents: Int!) {
    raiseBudgetAndResume(id: $id, newLimitCents: $newLimitCents) {
      id
      status
    }
  }
`;

// Domain 12 GAP-1: ingest a non-inference finance event (admin).
export const INGEST_FINANCE_EVENT = gql`
  mutation IngestFinanceEvent(
    $eventKind: String!
    $amountCents: Int!
    $direction: String
    $biller: String
    $description: String
    $estimated: Boolean
    $idempotencyKey: String
  ) {
    ingestFinanceEvent(
      eventKind: $eventKind
      amountCents: $amountCents
      direction: $direction
      biller: $biller
      description: $description
      estimated: $estimated
      idempotencyKey: $idempotencyKey
    ) {
      id
      eventKind
      direction
      amountCents
    }
  }
`;

// Domain 12 GAP-6 A13: reprice an unpriced/estimated cost event.
export const REPRICE_COST_EVENT = gql`
  mutation RepriceCostEvent($costEventId: String!, $amountCents: Int!) {
    repriceCostEvent(costEventId: $costEventId, amountCents: $amountCents) {
      id
      amountCents
      costStatus
    }
  }
`;

// Domain 14 #18: set an agent's token salary (0 removes it).
export const SET_AGENT_SALARY = gql`
  mutation SetAgentSalary($agentId: String!, $monthlyCents: Int!) {
    setAgentSalary(agentId: $agentId, monthlyCents: $monthlyCents) {
      id
      limitCents
      isSalary
    }
  }
`;
