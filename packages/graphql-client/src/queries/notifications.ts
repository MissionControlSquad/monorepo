import { gql } from "urql";

export const UNDELIVERED_NOTIFICATIONS_QUERY = gql`
  query UndeliveredNotifications {
    undeliveredNotifications {
      id
      mentionedAgentId
      content
      taskId
      messageId
      delivered
      deliveredAt
      createdAt
      mentionedAgent {
        id
        name
        identityEmoji
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

export const NOTIFICATIONS_BY_AGENT_QUERY = gql`
  query NotificationsByAgent($agentId: String!, $includeDelivered: Boolean, $limit: Int) {
    notificationsByAgent(agentId: $agentId, includeDelivered: $includeDelivered, limit: $limit) {
      id
      mentionedAgentId
      content
      taskId
      messageId
      delivered
      deliveredAt
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
