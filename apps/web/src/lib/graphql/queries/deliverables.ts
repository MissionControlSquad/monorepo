import { gql } from "urql";

export const DELIVERABLES_BY_TASK_QUERY = gql`
  query DeliverablesByTask($taskId: String!) {
    deliverablesByTask(taskId: $taskId) {
      id
      taskId
      profileId
      projectId
      title
      kind
      content
      language
      storageKey
      fileName
      mimeType
      fileSize
      url
      version
      createdAt
      profile {
        id
        displayName
        username
        avatarUrl
      }
    }
  }
`;

export const DELIVERABLES_BY_AGENT_QUERY = gql`
  query DeliverablesByAgent($agentId: String!, $projectId: String) {
    deliverablesByAgent(agentId: $agentId, projectId: $projectId) {
      id
      taskId
      profileId
      projectId
      title
      kind
      content
      language
      storageKey
      fileName
      mimeType
      fileSize
      url
      version
      createdAt
      task {
        id
        title
        taskNumber
        status
      }
    }
  }
`;

export const DELIVERABLE_QUERY = gql`
  query Deliverable($id: String!) {
    deliverable(id: $id) {
      id
      taskId
      profileId
      projectId
      title
      kind
      content
      language
      storageKey
      fileName
      mimeType
      fileSize
      url
      version
      createdAt
      profile {
        id
        displayName
        username
        avatarUrl
      }
      task {
        id
        title
        taskNumber
        status
      }
    }
  }
`;

export const DELIVERABLE_WITH_CONTEXT_QUERY = gql`
  query DeliverableWithContext($id: String!) {
    deliverableWithContext(id: $id) {
      id
      taskId
      profileId
      projectId
      title
      kind
      content
      language
      storageKey
      fileName
      mimeType
      fileSize
      url
      version
      createdAt
      profile {
        id
        displayName
        username
        avatarUrl
      }
      task {
        id
        title
        description
        taskNumber
        status
        priority
      }
    }
  }
`;

export const DELIVERABLES_BY_CHILD_TASKS_QUERY = gql`
  query DeliverablesByChildTasks($parentTaskId: String!) {
    deliverablesByChildTasks(parentTaskId: $parentTaskId)
  }
`;

export const DELIVERABLE_VERSIONS_QUERY = gql`
  query DeliverableVersions($deliverableId: String!) {
    deliverableVersions(deliverableId: $deliverableId) {
      id
      deliverableId
      version
      title
      kind
      content
      language
      storageKey
      fileName
      mimeType
      fileSize
      url
      editedByProfileId
      createdAt
      editedByProfile {
        id
        displayName
        username
        avatarUrl
      }
    }
  }
`;
