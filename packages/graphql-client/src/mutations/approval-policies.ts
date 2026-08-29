import { gql } from "urql";

export const SET_APPROVAL_POLICY = gql`
  mutation SetApprovalPolicy(
    $id: String
    $name: String!
    $action: String!
    $effect: String!
    $priority: Int
    $subject: JSON
    $condition: JSON
    $enabled: Boolean
  ) {
    setApprovalPolicy(
      id: $id
      name: $name
      action: $action
      effect: $effect
      priority: $priority
      subject: $subject
      condition: $condition
      enabled: $enabled
    ) {
      id
      name
      priority
      action
      effect
      enabled
      subject
      condition
    }
  }
`;

export const DELETE_APPROVAL_POLICY = gql`
  mutation DeleteApprovalPolicy($id: String!) {
    deleteApprovalPolicy(id: $id)
  }
`;

// Enforcement entrypoint: propose a gated agent action; the engine returns allow / require_approval /
// default (and throws on deny).
export const REQUEST_AGENT_ACTION = gql`
  mutation RequestAgentAction(
    $action: String!
    $agentId: String
    $costCents: Int
    $title: String
    $reason: String
    $taskId: String
  ) {
    requestAgentAction(
      action: $action
      agentId: $agentId
      costCents: $costCents
      title: $title
      reason: $reason
      taskId: $taskId
    ) {
      status
      matchedPolicyId
      approvalId
    }
  }
`;
