"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function AdaptersLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.MULTI_PROVIDER_ADAPTERS} featureName="Adapters">
      {children}
    </FeatureGate>
  );
}
