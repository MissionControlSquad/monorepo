import { gql } from "urql";

export const TASK_STATUS_COUNTS_QUERY = gql`
  query TaskStatusCounts($projectId: String) {
    taskStatusCounts(projectId: $projectId) {
      inbox
      assigned
      inProgress
      review
      done
      blocked
      total
    }
  }
`;

export const TASK_CYCLE_TIMES_QUERY = gql`
  query TaskCycleTimes($projectId: String) {
    taskCycleTimes(projectId: $projectId) {
      avgCycleTimeMs
      medianCycleTimeMs
      completedCount
    }
  }
`;

export const TASK_COMPLETION_TREND_QUERY = gql`
  query TaskCompletionTrend($days: Int, $projectId: String) {
    taskCompletionTrend(days: $days, projectId: $projectId) {
      date
      count
    }
  }
`;

export const AGENT_PRODUCTIVITY_QUERY = gql`
  query AgentProductivity($projectId: String) {
    agentProductivity(projectId: $projectId) {
      agentId
      agentName
      tasksAssigned
      tasksCompleted
      deliverablesCount
      totalWorkTimeMs
      queueCompletionRate
    }
  }
`;

export const AGENT_WORKLOAD_DISTRIBUTION_QUERY = gql`
  query AgentWorkloadDistribution($projectId: String) {
    agentWorkloadDistribution(projectId: $projectId) {
      agentId
      agentName
      inbox
      assigned
      inProgress
      review
      done
      blocked
    }
  }
`;

export const REVIEW_METRICS_QUERY = gql`
  query ReviewMetrics($projectId: String) {
    reviewMetrics(projectId: $projectId) {
      approved
      rejected
      clarification
    }
  }
`;

export const AGENT_ACTIVITY_HEATMAP_QUERY = gql`
  query AgentActivityHeatmap($days: Int, $projectId: String) {
    agentActivityHeatmap(days: $days, projectId: $projectId) {
      dayOfWeek
      hour
      count
    }
  }
`;

export const ACTIVITY_TREND_QUERY = gql`
  query ActivityTrend($days: Int, $projectId: String) {
    activityTrend(days: $days, projectId: $projectId) {
      date
      count
    }
  }
`;
