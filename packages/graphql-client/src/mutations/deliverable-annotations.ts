import { gql } from "urql";

export const ADD_DELIVERABLE_ANNOTATION = gql`
  mutation AddDeliverableAnnotation($deliverableId: String!, $body: String!, $quote: String) {
    addDeliverableAnnotation(deliverableId: $deliverableId, body: $body, quote: $quote) {
      id
    }
  }
`;

export const RESOLVE_DELIVERABLE_ANNOTATION = gql`
  mutation ResolveDeliverableAnnotation($id: String!, $resolved: Boolean!) {
    resolveDeliverableAnnotation(id: $id, resolved: $resolved) {
      id
      resolved
    }
  }
`;

export const DELETE_DELIVERABLE_ANNOTATION = gql`
  mutation DeleteDeliverableAnnotation($id: String!) {
    deleteDeliverableAnnotation(id: $id)
  }
`;
