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
  LIVE_GATEWAY: "live_gateway",
  GOVERNANCE: "governance",
  BUDGETS: "budgets",
  LEDGER: "ledger",
  MULTI_PROVIDER_ADAPTERS: "multi_provider_adapters",
  SECRETS_VAULT: "secrets_vault",
  PIPELINES_ROUTINES: "pipelines_routines",
  TASK_AUTONOMY: "task_autonomy",
  CASES: "cases",
  SKILLS_TEAMS: "skills_teams",
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
  [FLAG_KEYS.LIVE_GATEWAY]: false,
  [FLAG_KEYS.GOVERNANCE]: true,
  [FLAG_KEYS.BUDGETS]: true,
  [FLAG_KEYS.LEDGER]: true,
  // Opt-in: OpenClaw (builtIn) always works; extra providers unlock when enabled.
  [FLAG_KEYS.MULTI_PROVIDER_ADAPTERS]: false,
  [FLAG_KEYS.SECRETS_VAULT]: true,
  [FLAG_KEYS.PIPELINES_ROUTINES]: true,
  [FLAG_KEYS.TASK_AUTONOMY]: true,
  [FLAG_KEYS.CASES]: true,
  [FLAG_KEYS.SKILLS_TEAMS]: true,
};
