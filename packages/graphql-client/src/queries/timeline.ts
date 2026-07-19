import { gql } from "urql";

// Work timeline (Gantt) — completed agent work spans across the workspace.
export const WORK_TIMELINE_QUERY = gql`
  query WorkTimeline($from: DateTime, $to: DateTime, $projectId: String, $limit: Int) {
    workTimeline(from: $from, to: $to, projectId: $projectId, limit: $limit) {
      id
      agentId
      agentName
      taskId
      taskTitle
      taskNumber
      startedAt
      endedAt
    }
  }
`;
