import { gql } from "urql";

// Paperclip parity: actionable counts for the sidebar nav badges.
export const SIDEBAR_BADGES_QUERY = gql`
  query SidebarBadges {
    sidebarBadges {
      approvals
      review
      attention
    }
  }
`;
