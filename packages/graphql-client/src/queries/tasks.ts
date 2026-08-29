import { gql } from "urql";
import { PROFILE_FIELDS, PROFILE_WITH_AGENT_STATUS_FIELDS } from "../fragments";

// ── Shared field fragments ──────────────────────────────────

const ASSIGNEE_FIELDS = `
  assignees {
    id
    profileId
    profile {
      ${PROFILE_WITH_AGENT_STATUS_FIELDS}
    }
  }
`;

const ASSIGNEE_FIELDS_WITH_ASSIGNED_AT = `
  assignees {
    id
    profileId
    assignedAt
    profile {
      ${PROFILE_WITH_AGENT_STATUS_FIELDS}
    }
  }
`;

/** Core task fields used in list/card views (no description for performance). */
const TASK_CARD_FIELDS = `
  id
  title
  status
  priority
  createdAt
  updatedAt
  dueDate
  tags
  taskNumber
  parentTaskId
  projectId
  blockedByTaskId
  ${ASSIGNEE_FIELDS}
`;

/** Full task fields including description, used in list queries that need it. */
const TASK_LIST_FIELDS = `
  id
  title
  description
  status
  priority
  createdByProfileId
  createdAt
  updatedAt
  dueDate
  tags
  taskNumber
  parentTaskId
  projectId
  blockedByTaskId
  ${ASSIGNEE_FIELDS}
`;

/** Detail-level fields for single task views. */
const TASK_DETAIL_FIELDS = `
  id
  title
  description
  status
  priority
  createdByProfileId
  createdAt
  updatedAt
  dueDate
  tags
  taskNumber
  parentTaskId
  projectId
  blockedByTaskId
  createdByProfile {
    ${PROFILE_FIELDS}
  }
  parentTask {
    id
    title
    taskNumber
    status
  }
  blockedByTask {
    id
    title
    taskNumber
    status
  }
  project {
    id
    name
  }
  ${ASSIGNEE_FIELDS_WITH_ASSIGNED_AT}
`;

// ── Queries ─────────────────────────────────────────────────

// Unique operation name prevents urql from linking to active TASK_QUERY in detail screen
export const TASK_EDIT_QUERY = gql`
  query TaskEdit($id: String!) {
    task(id: $id) {
      id
      title
      description
      status
      priority
      taskNumber
      dueDate
      tags
      parentTaskId
      blockedByTaskId
      projectId
      project {
        id
        name
      }
      assignees {
        id
        profileId
        profile {
          id
          displayName
          username
          avatarUrl
          agentId
          agent { id identityEmoji }
        }
      }
    }
  }
`;

export const TASKS_QUERY = gql`
  query Tasks($limit: Int, $projectId: String) {
    tasks(limit: $limit, projectId: $projectId) {
      ${TASK_LIST_FIELDS}
    }
  }
`;

export const TASK_QUERY = gql`
  query Task($id: String!) {
    task(id: $id) {
      ${TASK_DETAIL_FIELDS}
    }
  }
`;

export const TASK_BY_NUMBER_QUERY = gql`
  query TaskByNumber($taskNumber: Int!) {
    taskByNumber(taskNumber: $taskNumber) {
      ${TASK_DETAIL_FIELDS}
    }
  }
`;

export const TASKS_BY_STATUS_QUERY = gql`
  query TasksByStatus($status: String!, $projectId: String) {
    tasksByStatus(status: $status, projectId: $projectId) {
      ${TASK_LIST_FIELDS}
    }
  }
`;

/** Initial load: 50 tasks per column; scroll-to-bottom loads more in same page size. */
const KANBAN_INITIAL_PAGE_SIZE = 50;

const KANBAN_LIMIT = String(KANBAN_INITIAL_PAGE_SIZE);
const FILTER_ARGS_DEF = `$priorities: [String!], $assigneeIds: [String!], $unassignedOnly: Boolean, $tags: [String!], $dueDateFilter: String, $blockedOnly: Boolean, $topLevelOnly: Boolean, $noProjectOnly: Boolean, $searchQuery: String`;
const FILTER_ARGS_PASS = `priorities: $priorities, assigneeIds: $assigneeIds, unassignedOnly: $unassignedOnly, tags: $tags, dueDateFilter: $dueDateFilter, blockedOnly: $blockedOnly, topLevelOnly: $topLevelOnly, noProjectOnly: $noProjectOnly, searchQuery: $searchQuery`;

export const KANBAN_BOARD_QUERY = gql`
  query KanbanBoard($projectId: String, ${FILTER_ARGS_DEF}) {
    inbox: tasksByStatus(status: "inbox", limit: ${KANBAN_LIMIT}, projectId: $projectId, ${FILTER_ARGS_PASS}) {
      ${TASK_CARD_FIELDS}
    }
    assigned: tasksByStatus(status: "assigned", limit: ${KANBAN_LIMIT}, projectId: $projectId, ${FILTER_ARGS_PASS}) {
      ${TASK_CARD_FIELDS}
    }
    in_progress: tasksByStatus(status: "in_progress", limit: ${KANBAN_LIMIT}, projectId: $projectId, ${FILTER_ARGS_PASS}) {
      ${TASK_CARD_FIELDS}
    }
    review: tasksByStatus(status: "review", limit: ${KANBAN_LIMIT}, projectId: $projectId, ${FILTER_ARGS_PASS}) {
      ${TASK_CARD_FIELDS}
    }
    blocked: tasksByStatus(status: "blocked", limit: ${KANBAN_LIMIT}, projectId: $projectId, ${FILTER_ARGS_PASS}) {
      ${TASK_CARD_FIELDS}
    }
    done: tasksByStatus(status: "done", limit: ${KANBAN_LIMIT}, projectId: $projectId, ${FILTER_ARGS_PASS}) {
      ${TASK_CARD_FIELDS}
    }
  }
`;

export const TASK_COUNTS_BY_STATUS_QUERY = gql`
  query TaskCountsByStatus($projectId: String, ${FILTER_ARGS_DEF}) {
    taskCountsByStatus(projectId: $projectId, ${FILTER_ARGS_PASS}) {
      status
      count
    }
  }
`;

export const LOAD_MORE_COLUMN_QUERY = gql`
  query LoadMoreColumn($status: String!, $limit: Int, $offset: Int, $projectId: String, ${FILTER_ARGS_DEF}) {
    tasksByStatus(status: $status, limit: $limit, offset: $offset, projectId: $projectId, ${FILTER_ARGS_PASS}) {
      ${TASK_CARD_FIELDS}
    }
  }
`;

export const TASKS_BY_ASSIGNEE_QUERY = gql`
  query TasksByAssignee($agentId: String!, $includeDone: Boolean, $projectId: String, $limit: Int) {
    tasksByAssignee(
      agentId: $agentId
      includeDone: $includeDone
      projectId: $projectId
      limit: $limit
    ) {
      ${TASK_LIST_FIELDS}
    }
  }
`;

export const TASKS_BY_STATUS_FOR_AGENT_QUERY = gql`
  query TasksByStatusForAgent($agentId: String!, $projectId: String) {
    tasksByStatusForAgent(agentId: $agentId, projectId: $projectId) {
      inbox
      assigned
      inProgress
      review
      done
      blocked
    }
  }
`;

export const CHILD_TASKS_QUERY = gql`
  query ChildTasks($parentTaskId: String!) {
    childTasks(parentTaskId: $parentTaskId) {
      ${TASK_LIST_FIELDS}
    }
  }
`;

export const TASK_WORK_SESSIONS_QUERY = gql`
  query TaskWorkSessions($taskId: String!) {
    taskWorkSessions(taskId: $taskId) {
      id
      taskId
      agentId
      projectId
      startedAt
      endedAt
      duration
      eventType
      agent {
        id
        name
        identityEmoji
      }
    }
  }
`;

export const TASK_WORK_SUMMARY_QUERY = gql`
  query TaskWorkSummary($taskId: String!) {
    taskWorkSummary(taskId: $taskId) {
      totalWorkTimeMs
      agentBreakdown {
        agentId
        agentName
        totalMs
      }
      activeSessionCount
    }
  }
`;

export const TASKS_BY_PROJECT_QUERY = gql`
  query TasksByProject($projectId: String!, $limit: Int) {
    tasksByProject(projectId: $projectId, limit: $limit) {
      ${TASK_LIST_FIELDS}
    }
  }
`;

// Parity §3.12 — a task's first-class labels.
export const TASK_LABELS_QUERY = gql`
  query TaskLabels($taskId: String!) {
    taskLabels(taskId: $taskId) {
      id
      labelId
      label {
        id
        name
        color
      }
    }
  }
`;
