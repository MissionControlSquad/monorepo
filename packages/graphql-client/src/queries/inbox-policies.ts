import { gql } from "urql";
export const INBOX_POLICIES_QUERY = gql`query InboxPolicies($itemKind: String) { inboxPolicies(itemKind: $itemKind) { id agentId itemKind action priority enabled } }`;
