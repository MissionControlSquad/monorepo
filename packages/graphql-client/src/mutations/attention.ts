import { gql } from "urql";

// Epic #20b: dismiss / restore an attention feed item.
export const DISMISS_ATTENTION_ITEM = gql`
  mutation DismissAttentionItem($itemKey: String!) {
    dismissAttentionItem(itemKey: $itemKey)
  }
`;

export const UNDISMISS_ATTENTION_ITEM = gql`
  mutation UndismissAttentionItem($itemKey: String!) {
    undismissAttentionItem(itemKey: $itemKey)
  }
`;
