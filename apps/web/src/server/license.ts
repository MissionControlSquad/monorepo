import { LicenseStatusCode } from "./constants";
import type { LicenseStatusCodeValue } from "./constants";

/**
 * License status for self-hosted AgentCenter.
 *
 * AgentCenter used to check a signed license against the hosted license server at
 * agentcenter.cloud. That service has been shut down and the project is MIT licensed, so there is
 * nothing left to check: every install is fully unlocked, with no feature gating, no agent,
 * project or seat limits, no grace period, no background refresh and no network calls.
 *
 * The status shape is kept only so older desktop and mobile clients that still call
 * GET /api/license (or read `license` from GET /api/auth/status) keep working unchanged.
 */

export interface LicenseInfo {
  status: LicenseStatusCodeValue;
  plan: string | null;
  org: string | null;
  features: string[];
  /** -1 means no limit. */
  maxAgents: number;
  /** -1 means no limit. */
  maxProjects: number;
  /** -1 means no limit. */
  maxSeats: number;
  expiresAt: string | null;
  message: string;
}

/** Sentinel the clients already understand as "no limit". */
export const UNLIMITED = -1;

const OPEN_SOURCE_LICENSE: Readonly<LicenseInfo> = Object.freeze({
  status: LicenseStatusCode.ACTIVE,
  plan: "community",
  org: null,
  features: [],
  maxAgents: UNLIMITED,
  maxProjects: UNLIMITED,
  maxSeats: UNLIMITED,
  expiresAt: null,
  message: "AgentCenter is open source (MIT). No license key is needed and nothing is limited.",
});

/** Always active, never expires, no limits. Pure: no I/O of any kind. */
export function getLicenseStatus(): LicenseInfo {
  return { ...OPEN_SOURCE_LICENSE, features: [] };
}
