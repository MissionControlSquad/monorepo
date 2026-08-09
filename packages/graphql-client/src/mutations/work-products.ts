import { gql } from "urql";

// Domain 8 G1: work-product mutations. Shared across web/desktop/mobile. WORK_PRODUCTS-gated.
export const CREATE_WORK_PRODUCT = gql`
  mutation CreateWorkProduct(
    $taskId: String!
    $kind: String!
    $title: String!
    $url: String
    $provider: String
    $externalId: String
    $createdByRunId: String
    $makePrimary: Boolean
  ) {
    createWorkProduct(
      taskId: $taskId
      kind: $kind
      title: $title
      url: $url
      provider: $provider
      externalId: $externalId
      createdByRunId: $createdByRunId
      makePrimary: $makePrimary
    ) {
      id
      kind
      isPrimary
      reviewState
      outputStatus
    }
  }
`;

export const SET_WORK_PRODUCT_REVIEW_STATE = gql`
  mutation SetWorkProductReviewState($deliverableId: String!, $reviewState: String!) {
    setWorkProductReviewState(deliverableId: $deliverableId, reviewState: $reviewState) {
      id
      reviewState
      outputStatus
    }
  }
`;

export const SET_WORK_PRODUCT_STATUS = gql`
  mutation SetWorkProductStatus($deliverableId: String!, $status: String!) {
    setWorkProductStatus(deliverableId: $deliverableId, status: $status) {
      id
      outputStatus
    }
  }
`;
