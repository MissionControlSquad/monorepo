"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function LocalServicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.LOCAL_SERVICES} featureName="Local Services">
      {children}
    </FeatureGate>
  );
}
