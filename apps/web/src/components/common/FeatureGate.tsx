"use client";

import { useFeatureFlag } from "../context/FeatureFlagContext";
import { Lock } from "lucide-react";

interface FeatureGateProps {
  flag: string;
  featureName: string;
  children: React.ReactNode;
}

/** Route-level gate: shows a "feature not available" page when the flag is disabled. */
export function FeatureGate({ flag, featureName, children }: FeatureGateProps) {
  const enabled = useFeatureFlag(flag);

  if (!enabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">{featureName}</h2>
          <p className="text-sm text-muted-foreground">
            This feature is not available on your current plan. Contact your administrator to enable
            it.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
