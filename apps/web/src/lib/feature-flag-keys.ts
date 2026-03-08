/** Central registry of all feature flag keys. Use these instead of raw strings. */
export const FLAG_KEYS = {
  CHANNELS: "channels",
  ANALYTICS: "analytics",
  RECURRING_TASKS: "recurring_tasks",
  CLOUD_VMS: "cloud_vms",
  REVIEWS: "reviews",
  DOCUMENTS: "documents",
  AGENT_QUEUE: "agent_queue",
  NOTIFICATIONS: "notifications",
} as const;

export type FlagKey = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS];

/** Default flag values used before the API responds. Keeps UI stable during loading. */
export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  [FLAG_KEYS.CHANNELS]: true,
  [FLAG_KEYS.ANALYTICS]: true,
  [FLAG_KEYS.RECURRING_TASKS]: true,
  [FLAG_KEYS.CLOUD_VMS]: false,
  [FLAG_KEYS.REVIEWS]: true,
  [FLAG_KEYS.DOCUMENTS]: true,
  [FLAG_KEYS.AGENT_QUEUE]: true,
  [FLAG_KEYS.NOTIFICATIONS]: true,
};
