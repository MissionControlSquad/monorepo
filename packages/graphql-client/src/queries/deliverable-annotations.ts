import { gql } from "urql";

// Tier C: deliverable review annotations.
export const DELIVERABLE_ANNOTATIONS_QUERY = gql`
  query DeliverableAnnotations($deliverableId: String!) {
    deliverableAnnotations(deliverableId: $deliverableId) {
      id
      body
      quote
      resolved
      createdAt
    }
  }
`;
