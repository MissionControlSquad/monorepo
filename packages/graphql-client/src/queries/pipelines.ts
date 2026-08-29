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

// Detail read for a single routine — definition, triggers (incl. cron schedule) and revisions.
export const ROUTINE_QUERY = gql`
  query Routine($id: String!) {
    routine(id: $id) {
      id
      name
      description
      definition
      isActive
      timezone
      currentVersion
      assigneeAgentId
      priority
      goalId
      projectId
      createdAt
      updatedAt
      triggers {
        id
        type
        cronExpression
        timezone
        nextFireAt
        publicId
        isEnabled
        concurrencyPolicy
        catchUpPolicy
        createdAt
      }
      revisions {
        id
        version
        createdAt
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
      sequentialOnly
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

// Detail read for a single pipeline — header + its ordered stages.
export const PIPELINE_QUERY = gql`
  query Pipeline($id: String!) {
    pipeline(id: $id) {
      id
      name
      description
      sequentialOnly
      isActive
      projectId
      createdAt
      updatedAt
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

// Aggregate pipeline metrics for the detail header (counts + per-stage distribution).
export const PIPELINE_STATS_QUERY = gql`
  query PipelineStats($pipelineId: String!) {
    pipelineStats(pipelineId: $pipelineId) {
      activeCount
      doneCount
      rejectedCount
      staleCount
      completedLast24h
      byStage {
        stageId
        stageName
        count
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
