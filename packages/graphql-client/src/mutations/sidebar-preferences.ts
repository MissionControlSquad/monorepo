import { gql } from "urql";

export const SET_SIDEBAR_PREFERENCE = gql`
  mutation SetSidebarPreference($orderedIds: [String!]!, $hiddenIds: [String!]!) {
    setSidebarPreference(orderedIds: $orderedIds, hiddenIds: $hiddenIds) {
      orderedIds
      hiddenIds
    }
  }
`;
