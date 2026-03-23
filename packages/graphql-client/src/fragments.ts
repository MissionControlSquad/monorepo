// ── Shared field fragments for GraphQL queries/mutations ──────────
//
// These string constants are interpolated into gql template literals.
// The field name (e.g. `profile`, `fromProfile`) is NOT included —
// callers wrap them: `profile { ${PROFILE_FIELDS} }`.

/** id, displayName, username, avatarUrl */
export const PROFILE_FIELDS = `
  id
  displayName
  username
  avatarUrl
`;

/** id, displayName, username (no avatar — compact views) */
export const PROFILE_MINIMAL_FIELDS = `
  id
  displayName
  username
`;

/** id, kind, displayName, username, avatarUrl */
export const PROFILE_WITH_KIND_FIELDS = `
  id
  kind
  displayName
  username
  avatarUrl
`;

/** Profile + agentId + basic agent identity */
export const PROFILE_WITH_AGENT_FIELDS = `
  id
  displayName
  username
  avatarUrl
  agentId
  agent {
    id
    name
    identityEmoji
  }
`;

/** Profile + agentId + full agent status (for task assignees) */
export const PROFILE_WITH_AGENT_STATUS_FIELDS = `
  id
  displayName
  username
  avatarUrl
  agentId
  agent {
    id
    name
    identityEmoji
    lastHeartbeat
    status
    detailedStatus
    currentTaskId
  }
`;
