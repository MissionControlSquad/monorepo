import { gql } from "urql";

// Epic #7: routines + pipelines reads.
export const ROUTINES_QUERY = gql`
  query Routines {
    routines {
      id
      name
      description
      isActive
      currentVersion
      assigneeAgentId
      priority
      goalId
      triggers {
        id
        type
        publicId
        isEnabled
      }
    }
  }
`;

export const ROUTINE_RUNS_QUERY = gql`
  query RoutineRuns($routineId: String!, $limit: Int) {
    routineRuns(routineId: $routineId, limit: $limit) {
      id
      status
      triggeredBy
      generatedTaskId
      error
      createdAt
    }
  }
`;

export const PIPELINES_QUERY = gql`
  query Pipelines {
    pipelines {
      id
      name
      description
      stages {
        id
        name
        order
        isReviewStage
        requireApproval
        slaMinutes
      }
    }
  }
`;

export const CASES_IN_PIPELINE_QUERY = gql`
  query CasesInPipeline($pipelineId: String!) {
    casesInPipeline(pipelineId: $pipelineId) {
      id
      title
      status
      currentStageId
      linkedTaskId
    }
  }
`;

export const REVIEW_CASES_QUERY = gql`
  query ReviewCases($pipelineId: String) {
    reviewCases(pipelineId: $pipelineId) {
      id
      title
      status
      currentStageId
    }
  }
`;

export const PIPELINE_HEALTH_QUERY = gql`
  query PipelineHealth($pipelineId: String!) {
    pipelineHealth(pipelineId: $pipelineId) {
      caseId
      title
      minutesInStage
      slaMinutes
    }
  }
`;

export const PIPELINE_CASE_EVENTS_QUERY = gql`
  query PipelineCaseEvents($caseId: String!) {
    pipelineCaseEvents(caseId: $caseId) {
      id
      type
      note
      actorProfileId
      createdAt
    }
  }
`;

export const STALE_CLAIMS_QUERY = gql`
  query StaleClaims($pipelineId: String, $leaseMinutes: Int) {
    staleClaims(pipelineId: $pipelineId, leaseMinutes: $leaseMinutes) {
      caseId
      title
      claimedByProfileId
      minutesClaimed
      leaseMinutes
    }
  }
`;
