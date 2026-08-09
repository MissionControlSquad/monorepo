import { gql } from "urql";

export const UPDATE_AGENT_STATUS = gql`
  mutation UpdateAgentStatus(
    $id: String!
    $status: String!
    $detailedStatus: String
    $statusMessage: String
    $currentTaskId: String
    $currentTask: String
  ) {
    updateAgentStatus(
      id: $id
      status: $status
      detailedStatus: $detailedStatus
      statusMessage: $statusMessage
      currentTaskId: $currentTaskId
      currentTask: $currentTask
    ) {
      id
      name
      role
      status
      detailedStatus
      statusMessage
      currentTask
      currentTaskId
      lastHeartbeat
    }
  }
`;

export const WAKE_AGENT = gql`
  mutation WakeAgent($apiKey: String!, $currentTask: String, $detailedStatus: String) {
    wakeAgent(apiKey: $apiKey, currentTask: $currentTask, detailedStatus: $detailedStatus) {
      id
      name
      role
      status
      detailedStatus
      statusMessage
      currentTask
      currentTaskId
      lastHeartbeat
    }
  }
`;

export const SLEEP_AGENT = gql`
  mutation SleepAgent($apiKey: String!) {
    sleepAgent(apiKey: $apiKey) {
      id
      name
      role
      status
      detailedStatus
      statusMessage
      currentTask
      currentTaskId
      lastHeartbeat
    }
  }
`;

export const AGENT_HEARTBEAT = gql`
  mutation AgentHeartbeat($apiKey: String!, $detailedStatus: String, $statusMessage: String) {
    agentHeartbeat(
      apiKey: $apiKey
      detailedStatus: $detailedStatus
      statusMessage: $statusMessage
    ) {
      id
      name
      status
      detailedStatus
      statusMessage
      lastHeartbeat
    }
  }
`;

export const UPDATE_AGENT_PROFILE = gql`
  mutation UpdateAgentProfile(
    $id: String!
    $name: String
    $role: String
    $personality: String
    $identityEmoji: String
    $llmModel: String
  ) {
    updateAgentProfile(
      id: $id
      name: $name
      role: $role
      personality: $personality
      identityEmoji: $identityEmoji
      llmModel: $llmModel
    ) {
      id
      name
      role
      personality
      identityEmoji
      llmModel
    }
  }
`;

export const SET_AGENT_ACTIVATION = gql`
  mutation SetAgentActivation($id: String!, $deactivated: Boolean!) {
    setAgentActivation(id: $id, deactivated: $deactivated) {
      id
      name
      role
      status
      setupStatus
      detailedStatus
      statusMessage
      currentTask
      currentTaskId
    }
  }
`;

export const SET_AGENT_VACATION = gql`
  mutation SetAgentVacation($id: String!, $onVacation: Boolean!) {
    setAgentVacation(id: $id, onVacation: $onVacation) {
      id
      name
      role
      status
      isOnVacation
      setupStatus
      detailedStatus
      statusMessage
      currentTask
      currentTaskId
    }
  }
`;

export const SYNC_AGENT_IDENTITY = gql`
  mutation SyncAgentIdentity(
    $apiKey: String!
    $name: String!
    $role: String!
    $avatar: String
    $personality: String
    $workspacePath: String
    $identityEmoji: String
    $level: String
    $username: String
  ) {
    syncAgentIdentity(
      apiKey: $apiKey
      name: $name
      role: $role
      avatar: $avatar
      personality: $personality
      workspacePath: $workspacePath
      identityEmoji: $identityEmoji
      level: $level
      username: $username
    ) {
      id
      name
      role
      status
      detailedStatus
      avatar
      personality
      workspacePath
      identityEmoji
      level
      username
      lastHeartbeat
    }
  }
`;
