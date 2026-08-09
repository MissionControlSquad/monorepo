import { gql } from "urql";
import { PROFILE_FIELDS } from "../fragments";

export const AGENTS_QUERY = gql`
  query Agents {
    agents {
      id
      name
      role
      status
      detailedStatus
      statusMessage
      currentTaskId
      currentTask
      avatar
      identityEmoji
      level
      username
      lastHeartbeat
      setupStatus
      isOnVacation
      memoryProvider
      apiKeyPrefix
      configVersion
      currentConfigVersion
      upgradeAvailable
      hostingType
      createdBy
      createdAt
      updatedAt
      profile {
        ${PROFILE_FIELDS}
      }
    }
  }
`;

export const AGENT_QUERY = gql`
  query Agent($id: String!) {
    agent(id: $id) {
      id
      name
      role
      status
      detailedStatus
      statusMessage
      currentTaskId
      currentTask
      avatar
      personality
      workspacePath
      identityEmoji
      level
      username
      lastHeartbeat
      setupStatus
      isOnVacation
      memoryProvider
      apiKeyPrefix
      configVersion
      currentConfigVersion
      upgradeAvailable
      hostingType
      adapterType
      adapterConfig
      llmModel
      createdBy
      createdAt
      updatedAt
      currentTaskRef {
        id
        title
        taskNumber
        status
      }
      profile {
        id
      }
    }
  }
`;

export const AGENT_STATUS_HISTORY_QUERY = gql`
  query AgentStatusHistory($agentId: String!, $limit: Int) {
    agentStatusHistory(agentId: $agentId, limit: $limit) {
      id
      agentId
      fromStatus
      toStatus
      fromDetailedStatus
      toDetailedStatus
      statusMessage
      timestamp
      agent {
        id
        name
        identityEmoji
      }
    }
  }
`;

export const AGENT_LATEST_TRANSITIONS_QUERY = gql`
  query AgentLatestTransitions {
    agentLatestTransitions {
      id
      agentId
      fromStatus
      toStatus
      fromDetailedStatus
      toDetailedStatus
      statusMessage
      timestamp
      agent {
        id
        name
        identityEmoji
      }
    }
  }
`;

// Unique operation name prevents urql from linking to active AGENT_QUERY in detail screen
export const AGENT_EDIT_QUERY = gql`
  query AgentEdit($id: String!) {
    agent(id: $id) {
      id
      name
      role
      personality
      identityEmoji
      username
    }
  }
`;

// Unique operation name prevents urql from linking to active AGENTS_QUERY in agents screen
export const AGENTS_FOR_TASK_QUERY = gql`
  query AgentsForTask {
    agents {
      id
      name
      identityEmoji
      currentTaskId
    }
  }
`;

// Unique operation name prevents urql from linking to active AGENTS_QUERY in agents screen
export const AGENTS_FOR_DELEGATE_QUERY = gql`
  query AgentsForDelegate {
    agents {
      id
      name
      role
      setupStatus
    }
  }
`;

export const AGENT_PROFILE_STATS_QUERY = gql`
  query AgentProfileStats($agentId: String!, $projectId: String) {
    agentProfileStats(agentId: $agentId, projectId: $projectId) {
      tasksAssigned
      tasksCompleted
      deliverablesCount
      totalWorkTimeMs
      queueCompletionRate
    }
  }
`;
