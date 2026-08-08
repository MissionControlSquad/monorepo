/**
 * Pure logic for the onboarding local-install variant.
 *
 * The onboarding flow can install AgentCenter one of two ways:
 *   - "cloud" - the hosted path (create agents that run on AgentCenter Cloud), and
 *   - "local" - the self-host path (download and run the `@agentcenter/runner`
 *     daemon on your own machine, then pair it with this workspace).
 *
 * Everything here is deterministic and side-effect free so it can be unit-tested
 * in isolation from React and the network: the mode/step state machine, the
 * runner command rendering, and the mapping of the cli-auth device-pairing poll
 * status into a UI status. The pairing itself reuses the existing cli-auth
 * device-authorization endpoints (POST /api/cli-auth/start + /poll) - it is not
 * reinvented here.
 */

// ─── Install mode ───────────────────────────────────────────────────────────

export type InstallMode = "cloud" | "local";

export interface InstallModeOption {
  id: InstallMode;
  title: string;
  tagline: string;
  description: string;
  bullets: string[];
  recommended?: boolean;
}

export const INSTALL_MODES: InstallModeOption[] = [
  {
    id: "cloud",
    title: "AgentCenter Cloud",
    tagline: "Fully managed",
    description:
      "Your agents run on AgentCenter's infrastructure. Nothing to install - pick a use case and deploy a squad in minutes.",
    bullets: [
      "Zero setup - agents run in the cloud",
      "Autonomous heartbeats managed for you",
      "Best for getting started fast",
    ],
    recommended: true,
  },
  {
    id: "local",
    title: "Local install",
    tagline: "Self-hosted",
    description:
      "Run the AgentCenter runner on your own machine. Your agents execute locally and connect back to this dashboard over an outbound-only link.",
    bullets: [
      "Code and secrets stay on your machine",
      "Runs behind NAT - no inbound ports",
      "Best for private repos and local tools",
    ],
  },
];

export function isInstallMode(value: unknown): value is InstallMode {
  return value === "cloud" || value === "local";
}

// ─── Local sub-flow step machine ────────────────────────────────────────────

/**
 * Steps for the local self-host sub-flow:
 *   install   - show the runner install command,
 *   connect   - start a cli-auth pairing challenge and wait for approval,
 *   connected - pairing succeeded; show the login/start commands.
 */
export type LocalStep = "install" | "connect" | "connected";

export const LOCAL_STEPS: LocalStep[] = ["install", "connect", "connected"];

export function localStepIndex(step: LocalStep): number {
  return LOCAL_STEPS.indexOf(step);
}

/** Human-facing "Step N of M" position (1-based) for a local step. */
export function localStepPosition(step: LocalStep): { step: number; total: number } {
  return { step: localStepIndex(step) + 1, total: LOCAL_STEPS.length };
}

export function nextLocalStep(step: LocalStep): LocalStep | null {
  const i = localStepIndex(step);
  return i >= 0 && i < LOCAL_STEPS.length - 1 ? LOCAL_STEPS[i + 1] : null;
}

export function prevLocalStep(step: LocalStep): LocalStep | null {
  const i = localStepIndex(step);
  return i > 0 ? LOCAL_STEPS[i - 1] : null;
}

// ─── Runner command rendering ───────────────────────────────────────────────

/** The published npm package for the standalone runner daemon. */
export const RUNNER_PACKAGE = "@agentcenter/runner";

/** The runner's binary name (see packages/runner/package.json `bin`). */
export const RUNNER_BIN = "agentcenter-runner";

/** Default runtime adapter suggested during onboarding. */
export const DEFAULT_RUNNER_RUNTIME = "openclaw";

/** `npm i -g @agentcenter/runner` - install the runner globally. */
export function runnerInstallCommand(): string {
  return `npm i -g ${RUNNER_PACKAGE}`;
}

export interface RunnerLoginOptions {
  apiUrl: string;
  apiKey?: string | null;
  runtime?: string;
}

/**
 * Render the `agentcenter-runner login` command. When the pairing has minted an
 * API key it is filled in; before that a placeholder is shown so the shape of
 * the command is clear.
 */
export function runnerLoginCommand({
  apiUrl,
  apiKey,
  runtime = DEFAULT_RUNNER_RUNTIME,
}: RunnerLoginOptions): string {
  const url = normalizeApiUrl(apiUrl);
  const key = apiKey && apiKey.trim().length > 0 ? apiKey.trim() : "<paste-key-from-approval>";
  return `${RUNNER_BIN} login --api-url ${url} --api-key ${key} --runtime ${runtime}`;
}

/** `agentcenter-runner start` - begin polling for work once logged in. */
export function runnerStartCommand(): string {
  return `${RUNNER_BIN} start`;
}

/** Strip a trailing slash so rendered URLs are stable and copy-pasteable. */
export function normalizeApiUrl(apiUrl: string): string {
  const trimmed = (apiUrl ?? "").trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

// ─── Pairing status (cli-auth device flow) ──────────────────────────────────

/**
 * UI-facing pairing status. Mirrors the cli-auth challenge lifecycle
 * (`pending | approved | denied | expired`) plus local-only `idle`/`error`.
 */
export type PairingStatus = "idle" | "pending" | "approved" | "denied" | "expired" | "error";

/** Map a raw cli-auth poll status string into a {@link PairingStatus}. */
export function mapPollStatus(raw: string | null | undefined): PairingStatus {
  switch (raw) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "denied":
      return "denied";
    case "expired":
      return "expired";
    default:
      return "error";
  }
}

export function isPairingComplete(status: PairingStatus): boolean {
  return status === "approved";
}

/** Whether polling should continue for a given status. */
export function isPairingPollable(status: PairingStatus): boolean {
  return status === "idle" || status === "pending";
}

export function pairingStatusLabel(status: PairingStatus): string {
  switch (status) {
    case "idle":
      return "Not started";
    case "pending":
      return "Waiting for approval…";
    case "approved":
      return "Connected";
    case "denied":
      return "Pairing denied";
    case "expired":
      return "Pairing code expired";
    case "error":
      return "Something went wrong";
  }
}

/** Format the short human pairing code with a mid separator for readability. */
export function formatUserCode(code: string): string {
  const cleaned = (code ?? "").trim();
  if (cleaned.length >= 6 && cleaned.length % 2 === 0) {
    const mid = cleaned.length / 2;
    return `${cleaned.slice(0, mid)}-${cleaned.slice(mid)}`;
  }
  return cleaned;
}
