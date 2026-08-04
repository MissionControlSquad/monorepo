import { gql } from "urql";

// Paperclip parity: a user's sidebar nav order + hidden items.
export const SIDEBAR_PREFERENCE_QUERY = gql`
  query SidebarPreference {
    sidebarPreference {
      orderedIds
      hiddenIds
    }
  }
`;
