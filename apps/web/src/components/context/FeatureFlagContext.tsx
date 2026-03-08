"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useQuery, useSubscription } from "urql";
import { FEATURE_FLAGS_QUERY } from "../../lib/graphql/queries";
import { FEATURE_FLAGS_CHANGED_SUBSCRIPTION } from "../../lib/graphql/subscriptions";
import { FLAG_DEFAULTS } from "../../lib/feature-flag-keys";
import type { FlagKey } from "../../lib/feature-flag-keys";

type ManagedBy = "system" | "user";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  managedBy: ManagedBy;
  description: string | null;
}

interface FeatureFlagContextType {
  /** Check if a feature is enabled. Returns true if flag doesn't exist (permissive default). */
  isEnabled: (key: string) => boolean;
  /** Get full flag info including managedBy. */
  getFlag: (key: string) => FeatureFlag | undefined;
  /** All flags as a list. */
  flags: FeatureFlag[];
  /** Loading state — true while flags are being fetched for the first time. */
  loading: boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextType | undefined>(undefined);

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const [result] = useQuery({ query: FEATURE_FLAGS_QUERY });

  // Real-time updates: when infra toggles a flag, the subscription pushes the full list
  const [subResult] = useSubscription({
    query: FEATURE_FLAGS_CHANGED_SUBSCRIPTION,
  });
  const subFlags = (subResult.data?.featureFlagsChanged ?? null) as FeatureFlag[] | null;

  // Prefer subscription data (most recent) over query data
  const featureFlags = (subFlags ?? result.data?.featureFlags ?? []) as FeatureFlag[];

  const flagMap = useMemo(() => {
    const map = new Map<string, FeatureFlag>();
    for (const flag of featureFlags) {
      map.set(flag.key, flag);
    }
    return map;
  }, [featureFlags]);

  const isEnabled = useMemo(() => {
    return (key: string): boolean => {
      const flag = flagMap.get(key);
      if (flag) return flag.enabled;
      // Before API responds, use defaults; unknown keys default to true
      return FLAG_DEFAULTS[key as FlagKey] ?? true;
    };
  }, [flagMap]);

  const getFlag = useMemo(() => {
    return (key: string): FeatureFlag | undefined => flagMap.get(key);
  }, [flagMap]);

  const value = useMemo(
    () => ({
      isEnabled,
      getFlag,
      flags: featureFlags,
      loading: result.fetching && !result.data,
    }),
    [isEnabled, getFlag, featureFlags, result.fetching, result.data],
  );

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error("useFeatureFlags must be used within FeatureFlagProvider");
  }
  return context;
}

/** Convenience hook: returns true if the feature is enabled. */
export function useFeatureFlag(key: string): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key);
}

/** Render children only when the feature flag is enabled. */
export function WhenFeatureEnabled({
  flag,
  fallback,
  children,
}: {
  flag: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const enabled = useFeatureFlag(flag);
  return enabled ? <>{children}</> : (fallback ?? null);
}

/** Render children only when the feature flag is disabled. */
export function WhenFeatureDisabled({
  flag,
  children,
}: {
  flag: string;
  children: React.ReactNode;
}) {
  const enabled = useFeatureFlag(flag);
  return enabled ? null : <>{children}</>;
}
