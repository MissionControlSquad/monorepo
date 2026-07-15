import { gql } from "urql";

// Epic #7: routines + pipelines mutations.
export const CREATE_ROUTINE = gql`
  mutation CreateRoutine(
    $name: String!
    $definition: JSON!
    $description: String
    $assigneeAgentId: String
    $priority: String
    $goalId: String
  ) {
    createRoutine(
      name: $name
      definition: $definition
      description: $description
      assigneeAgentId: $assigneeAgentId
      priority: $priority
      goalId: $goalId
    ) {
      id
    }
  }
`;

export const TRIGGER_ROUTINE_NOW = gql`
  mutation TriggerRoutineNow($routineId: String!) {
    triggerRoutineNow(routineId: $routineId) {
      id
      status
      generatedTaskId
    }
  }
`;

export const ADD_ROUTINE_TRIGGER = gql`
  mutation AddRoutineTrigger($routineId: String!, $type: String!) {
    addRoutineTrigger(routineId: $routineId, type: $type) {
      id
      type
      publicId
    }
  }
`;

export const CREATE_PIPELINE = gql`
  mutation CreatePipeline($name: String!, $description: String) {
    createPipeline(name: $name, description: $description) {
      id
    }
  }
`;

export const ADD_PIPELINE_STAGE = gql`
  mutation AddPipelineStage(
    $pipelineId: String!
    $name: String!
    $order: Int!
    $isReviewStage: Boolean
    $requireApproval: Boolean
    $slaMinutes: Int
  ) {
    addPipelineStage(
      pipelineId: $pipelineId
      name: $name
      order: $order
      isReviewStage: $isReviewStage
      requireApproval: $requireApproval
      slaMinutes: $slaMinutes
    ) {
      id
    }
  }
`;

export const CREATE_PIPELINE_CASE = gql`
  mutation CreatePipelineCase($pipelineId: String!, $title: String!) {
    createPipelineCase(pipelineId: $pipelineId, title: $title) {
      id
    }
  }
`;

export const CLAIM_CASE = gql`
  mutation ClaimCase($caseId: String!) {
    claimCase(caseId: $caseId) {
      id
      status
    }
  }
`;

export const TRANSITION_CASE = gql`
  mutation TransitionCase($caseId: String!, $toStageId: String!) {
    transitionCase(caseId: $caseId, toStageId: $toStageId) {
      id
      currentStageId
      status
    }
  }
`;

export const REJECT_CASE = gql`
  mutation RejectCase($caseId: String!) {
    rejectCase(caseId: $caseId) {
      id
      status
    }
  }
`;
