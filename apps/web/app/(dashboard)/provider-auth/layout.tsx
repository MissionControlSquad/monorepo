"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function ProviderAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.PROVIDER_AUTH} featureName="Provider Auth">
      {children}
    </FeatureGate>
  );
}
