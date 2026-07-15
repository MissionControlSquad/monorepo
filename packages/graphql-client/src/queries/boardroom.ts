import { gql } from "urql";

// Epic #15: boardroom read.
export const BOARD_THREAD_QUERY = gql`
  query BoardThread {
    boardThread {
      id
      title
      messages {
        id
        role
        body
        feedbackScore
        feedbackReason
        createdAt
      }
    }
  }
`;
