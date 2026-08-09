import { gql } from "urql";

// Epic #15: post a board-chat turn (returns the assistant reply).
export const SEND_BOARD_MESSAGE = gql`
  mutation SendBoardMessage($body: String!) {
    sendBoardMessage(body: $body) {
      id
      role
      body
      createdAt
    }
  }
`;

export const SET_BOARD_MESSAGE_FEEDBACK = gql`
  mutation SetBoardMessageFeedback($messageId: String!, $score: Int!, $reason: String) {
    setBoardMessageFeedback(messageId: $messageId, score: $score, reason: $reason) {
      id
      feedbackScore
      feedbackReason
    }
  }
`;
