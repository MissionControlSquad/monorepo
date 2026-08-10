"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function EnvironmentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.ENVIRONMENTS} featureName="Environments">
      {children}
    </FeatureGate>
  );
}
