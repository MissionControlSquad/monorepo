import { gql } from "urql";

// Tier C: deliverable vote summary.
export const DELIVERABLE_VOTES_QUERY = gql`
  query DeliverableVotes($deliverableId: String!) {
    deliverableVotes(deliverableId: $deliverableId) {
      score
      upCount
      downCount
      myVote
    }
  }
`;
