import { gql } from "urql";

export const CAST_DELIVERABLE_VOTE = gql`
  mutation CastDeliverableVote($deliverableId: String!, $value: Int!) {
    castDeliverableVote(deliverableId: $deliverableId, value: $value) {
      score
      upCount
      downCount
      myVote
    }
  }
`;
