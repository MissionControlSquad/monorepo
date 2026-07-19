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
