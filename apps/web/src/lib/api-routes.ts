/**
 * Centralized API route string constants for client-side fetch calls.
 * Use these instead of inline string literals to catch typos at build time
 * and make route renames a single-file change.
 */
export const API_ROUTES = {
  agents: {
    list: "/api/agents",
    create: "/api/agents/create",
    batchCreate: "/api/agents/batch-create",
  },
  auth: {
    logout: "/api/auth/logout",
  },
  channels: {
    attachments: "/api/channels/attachments",
  },
  cloudVms: {
    list: "/api/cloud-vms",
  },
  license: {
    get: "/api/license",
  },
  liveGateway: {
    connections: "/api/live-gateway/connections",
    tokens: "/api/live-gateway/tokens",
  },
  onboarding: {
    get: "/api/onboarding",
  },
  profile: {
    avatar: "/api/profile/avatar",
  },
  userNotifications: {
    preferences: "/api/user-notifications/preferences",
    subscribe: "/api/user-notifications/subscribe",
  },
} as const;
