import { gql } from "urql";

export const MARK_NOTIFICATION_DELIVERED = gql`
  mutation MarkNotificationDelivered($id: String!) {
    markNotificationDelivered(id: $id) {
      id
      mentionedAgentId
      content
      taskId
      messageId
      delivered
      deliveredAt
      createdAt
    }
  }
`;

export const MARK_MANY_NOTIFICATIONS_DELIVERED = gql`
  mutation MarkManyNotificationsDelivered($ids: [String!]!) {
    markManyNotificationsDelivered(ids: $ids)
  }
`;
