"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function PortabilityLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.WORKSPACE_PORTABILITY} featureName="Portability">
      {children}
    </FeatureGate>
  );
}
