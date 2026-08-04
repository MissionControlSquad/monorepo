// Trust-preset resolver (parity #169). Maps a trust LEVEL to the recommended containment settings, so
// selecting a level pre-fills sensible defaults (the editor can still override any toggle). Pure.

import type { TrustLevel } from "./trust";

export const TRUST_LEVELS: TrustLevel[] = ["untrusted", "low", "standard", "trusted"];

export interface TrustContainmentPreset {
  /** Force isolation for this agent's runs. */
  lowTrustContainment: boolean;
  /** Require human review before merging this agent's untrusted PRs. */
  requireUntrustedPrReview: boolean;
  /** Auto-promote deliverables without manual gating. */
  autoPromoteWorkProduct: boolean;
  /** Ask before applying agent-proposed changes. */
  changeConsentRequired: boolean;
}

// Progressively relaxes as trust increases: untrusted is fully contained + gated; trusted runs freely.
const PRESETS: Record<TrustLevel, TrustContainmentPreset> = {
  untrusted: {
    lowTrustContainment: true,
    requireUntrustedPrReview: true,
    autoPromoteWorkProduct: false,
    changeConsentRequired: true,
  },
  low: {
    lowTrustContainment: true,
    requireUntrustedPrReview: true,
    autoPromoteWorkProduct: false,
    changeConsentRequired: false,
  },
  standard: {
    lowTrustContainment: false,
    requireUntrustedPrReview: false,
    autoPromoteWorkProduct: true,
    changeConsentRequired: false,
  },
  trusted: {
    lowTrustContainment: false,
    requireUntrustedPrReview: false,
    autoPromoteWorkProduct: true,
    changeConsentRequired: false,
  },
};

export function isTrustLevel(value: unknown): value is TrustLevel {
  return typeof value === "string" && (TRUST_LEVELS as string[]).includes(value);
}

/** Recommended containment settings for a trust level (falls back to `standard` for unknown input). */
export function trustPresetForLevel(level: string): TrustContainmentPreset {
  return isTrustLevel(level) ? PRESETS[level] : PRESETS.standard;
}
