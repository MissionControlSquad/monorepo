import { gql } from "urql";

// Submit feedback (thumbs-up/down + optional comment). FEEDBACK-gated; comment redacted server-side.
export const SUBMIT_FEEDBACK = gql`
  mutation SubmitFeedback($targetType: String!, $targetId: String, $rating: String!, $comment: String) {
    submitFeedback(targetType: $targetType, targetId: $targetId, rating: $rating, comment: $comment) {
      id
      rating
      comment
      createdAt
    }
  }
`;
