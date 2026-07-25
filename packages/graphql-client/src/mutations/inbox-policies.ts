import { gql } from "urql";
export const SET_INBOX_POLICY = gql`mutation SetInboxPolicy($id: String, $agentId: String, $itemKind: String!, $action: String!, $priority: Int, $enabled: Boolean) { setInboxPolicy(id: $id, agentId: $agentId, itemKind: $itemKind, action: $action, priority: $priority, enabled: $enabled) { id itemKind action priority enabled } }`;
export const DELETE_INBOX_POLICY = gql`mutation DeleteInboxPolicy($id: String!) { deleteInboxPolicy(id: $id) }`;
